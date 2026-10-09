# Discoverify Design Note

## Overview

Discoverify is a multi-tenant vehicle-recovery prototype. Cameras submit
sightings of registered target vehicles, and eligible sightings become cases
that recovery-agency staff can claim.

The application is a modular monolith: React provides the interface, FastAPI
handles authentication and business workflows, and PostgreSQL is the source of
truth.

## Database design

![Discoverify current PostgreSQL schema](./artifacts/db-schema.svg)

The implemented schema is defined in
[`backend/app/db/schema.sql`](./backend/app/db/schema.sql). Its key decisions
are:

- Agency vehicles belong to tenants; cameras belong to agency vehicles. Scan
  ingestion derives tenancy from the camera rather than a caller-supplied ID.
- Target vehicles are shared registry records and remain separate from each
  tenant's agency vehicles.
- Scans attach to target vehicles rather than cases, preserving sightings from
  before a case existed and from other tenants.
- `PENDING_CLAIM` cases have no owner. Claiming assigns the tenant and staff
  user and changes the status to `ACTIVE`.

PostgreSQL enforces one global pending case per vehicle and one active case per
tenant and vehicle. An atomic conditional update ensures concurrent claim
attempts have one winner.

The case assignment constraint keeps state valid:

```text
PENDING_CLAIM  => tenant_id and assignee_id are NULL
ACTIVE/CLOSED  => tenant_id and assignee_id are present
```

Multiple closed cases are allowed. Different tenants may also hold active
cases for the same vehicle when they have independent recovery instructions.

Because scans join to cases through `vehicle_id`, case history is live rather
than a snapshot. It can include sightings before case creation and after
closure. Immutable evidence would require an explicit case-to-scan link or
closure boundary.

VINs are uppercase 17-character identifiers. Plates are uppercase with spaces
and hyphens removed. Database checks and normalized unique indexes enforce
these forms; ingestion rejects unknown or mismatched VIN/plate pairs.

## Multi-tenancy and access control

Discoverify uses shared tables with explicit `tenant_id` ownership. FastAPI
enforces tenant filtering in SQL; the tenant is loaded from the authenticated
user and is never trusted from the browser.

Authentication uses an Argon2 password hash and a 30-minute JWT in an HttpOnly,
SameSite cookie.

Protected requests validate the JWT signature, issuer, audience, expiry, and
subject, then reload the user and tenant from PostgreSQL. Frontend route guards
improve navigation but are not security controls.

| Capability | Agent | Staff | Admin |
|---|---:|---:|---:|
| Read tenant-owned cases | No | Yes | Yes |
| Browse global pending cases | No | Yes | No |
| Claim a pending case | No | Yes | No |
| Submit a simulated scan | No login | No login | No login |

The pending pool is the deliberate cross-tenant exception. After a staff user
claims a case, the API derives the tenant and assignee from that staff record;
the case then becomes tenant-owned.

Staff and administrators can read only active or closed cases belonging to
their tenant. Foreign, missing, and pending case IDs return the same 404 from
the tenant detail endpoint, reducing record-enumeration leakage.

Case history can include sightings from other tenants, but foreign camera,
agency-vehicle, and reporter identities are redacted. Location, time, and scan
image remain visible.

The unauthenticated scan endpoint is a prototype boundary. Production use
requires device credentials, signed requests, replay protection, and rate
limiting.

## Deployment sketch

![Discoverify simple AWS deployment](./artifacts/aws_basic.png)

The initial AWS deployment keeps one application unit:

- Package the React build into the FastAPI container and store the image in
  Amazon ECR.
- Run the container on Amazon ECS with AWS Fargate over HTTPS.
- Use private Amazon RDS for PostgreSQL with automated backups.
- Store scan photos in private Amazon S3 and provide authorized, time-limited
  access.
- Supply database and JWT secrets through managed configuration and collect
  application logs and health metrics.

ECS is preferred over EKS because the current system has one application
service and does not justify Kubernetes complexity.

This is a target deployment. Locally, React runs through Vite, Docker Compose
runs PostgreSQL, and scans store supplied image URLs rather than S3 objects.

Under sustained load, FastAPI can scale behind a load balancer, React can move
to S3 and CloudFront, and bursty scan processing can use a queue.

## Key trade-offs

- Shared tables simplify operation but make correct tenant predicates critical;
  PostgreSQL row-level security is a possible defense-in-depth step.
- Vehicle-linked scans preserve network-wide intelligence but do not provide
  immutable per-case history.
- Serving React from FastAPI simplifies the initial release but couples static
  delivery to API capacity until the frontend moves to S3 and CloudFront.
- Raw SQL makes authorization and invariants explicit, but production schema
  changes need versioned migrations rather than destructive development seeds.
