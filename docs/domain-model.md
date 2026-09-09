# Domain Model

## 1. Purpose

This document defines the business entities and their relationships.

The model must preserve historical information and distinguish current
equipment information from observations made during field visits.

## 2. Core Entities

The core entities are:

- User.
- Site.
- Equipment.
- Observation.
- Conversation.
- Capture Source.
- Attribute Confidence.
- Synchronization Record.

## 3. User

Represents a person who can access the application and capture data.

### Attributes

- `id`
- `name`
- `role`
- `site_id`
- `city`
- `country`

### Roles

- `field_user`
- `sales`
- `medical_staff`

The role controls access to application functionality.

## 4. Site

Represents a hospital, customer, or other installation location.

The term `Site` is used to avoid forcing the application to treat
hospital and customer as separate concepts before the business model
requires that distinction.

### Attributes

- `id`
- `name`
- `country`
- `city`
- `latitude`
- `longitude`
- `address`
- `created_at`
- `updated_at`

### Relationship

One site can contain many equipment records.

## 5. Equipment

Represents a physical medical equipment item or a group of equipment
when the application intentionally models a group.

### Attributes

- `id`
- `site_id`
- `brand`
- `model`
- `modality`
- `quantity`
- `installation_year`
- `created_at`
- `updated_at`

### Important Rule

Equipment represents the entity being observed.

Observation represents information collected about that equipment.

Do not create a new equipment record for every visit unless the
business rules explicitly require it.

## 6. Observation

Represents a record of information collected during a visit or capture
session.

### Attributes

- `id`
- `equipment_id`
- `site_id`
- `visit_date`
- `quantity`
- `brand`
- `model`
- `modality`
- `estimated_years_of_use`
- `estimated_installation_year`
- `operational_status`
- `capture_source`
- `notes`
- `overall_confidence`
- `created_by`
- `created_at`
- `updated_at`

### Relationship

One equipment record can have many observations.

### Language of Free-Text Fields

`notes` (and any other free-text field) is stored in the user's
preferred/original language — confirmed in `docs/ai-agent.md` §12 and
`docs/tech-stack.md` §7.2. Any English text produced internally by
MedPsy during reasoning is a transient working copy and is never
persisted here.

This raises a related, still-open question not yet decided: whether
`Observation` (or `User`) needs an explicit `language` attribute to
record which language `notes` is actually written in, for future
search/reporting across a multi-language dataset. Not adding it yet —
flagging it so it isn't silently assumed one way or the other.

## 7. Attribute Confidence

Confidence must be stored at the attribute level.

### Example

```text
brand: high
model: medium
modality: high
installation_year: low
operational_status: medium
```

The general confidence value is derived from the individual confidence
values according to an explicit business rule.

## 8. Attribute Status

Each extracted attribute may have a status.

### Allowed Values

- `confirmed`
- `reported`
- `estimated`
- `unknown`

### Definitions

- `confirmed`: verified by a reliable source.
- `reported`: provided by the user without verification.
- `estimated`: approximate information.
- `unknown`: no sufficient information.

## 9. Capture Source

The source of an attribute or observation may be:

- `voice`
- `text`
- `image`

If multiple sources are used, the model must support multiple sources or a
source-combination strategy.

Do not overwrite the original source when combining information.

## 10. Conversation

Represents an interaction session with the AI agent.

### Attributes

- `id`
- `user_id`
- `started_at`
- `ended_at`
- `status`
- `transcript_reference`
- `summary`
- `created_at`

The conversation may produce one or more observations.

## 11. Synchronization Record

Represents the synchronization state of a local record.

### Attributes

- `id`
- `entity_type`
- `entity_id`
- `operation`
- `sync_status`
- `last_attempt_at`
- `last_error`
- `server_version`
- `local_version`

## 12. Relationships

```
User
  └── creates ──> Conversation
  └── creates ──> Observation

Site
  └── contains ──> Equipment
                     └── has ──> Observation

Conversation
  └── produces ──> Observation

Observation
  └── has ──> Attribute Confidence
  └── has ──> Capture Source
```

## 13. Grouped Equipment

The application must explicitly define how grouped equipment is modeled.

Example:

> "There are approximately five Philips monitors."

Possible interpretation:

```
Equipment
  quantity = 5
```

Possible alternative:

```
Five separate equipment records
```

The initial implementation should prefer a grouped record when the
conversation does not provide enough information to distinguish individual
physical items.

## 14. Historical Data

Observations must not be deleted merely because newer information exists.

A new visit should create a new observation or update an existing record
according to an explicit business rule.

## 15. Open Decisions

- Whether Hospital and Customer become separate entities.
- Whether grouped equipment requires individual identifiers.
- Whether confidence is calculated by majority vote or another method.
- Whether status is stored per attribute or only at observation level.
- Whether source is stored per attribute or only at observation level.
- Whether equipment can move between sites.
