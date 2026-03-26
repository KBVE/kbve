# KBVE Forums — Design Specification

## 1. Overview

KBVE Forums is a **tag-first, space-driven discussion platform** that combines:

- Structured community spaces (`/`)
- Flexible tagging (`#`)
- Direct user interaction (`@`)

The system replaces rigid forum threads and subreddit silos with a **post-centric model** where discovery is driven by **spaces and tags**.

---

## 2. Core Syntax

### 2.1 Users

- Prefix: `@`
- Represents identity and authorship
- Example: `@alholy`

### 2.2 Spaces (Categories / Topics)

- Prefix: `/`
- Represents official, curated domains
- Example: `/gamedev`, `/unreal`, `/backend`

### 2.3 Tags

- Prefix: `#`
- Represents descriptive metadata
- Example: `#networking`, `#inventory`, `#replication`

---

## 3. Core Concepts

### 3.1 Post-Centric Model

- Posts are the primary unit of content
- Posts are not locked to a single container
- Posts are associated with:
    - One primary space (`/`)
    - Optional additional spaces (if allowed)
    - Multiple tags (`#`)

### 3.2 Spaces as Navigation Layer

- Spaces define structured discovery
- Spaces are curated and moderated
- Spaces may represent:
    - Domains (`/gamedev`)
    - Technologies (`/unreal`)
    - Systems (`/networking`)

### 3.3 Tags as Cross-Cutting Metadata

- Tags provide flexible classification
- Tags enable:
    - Cross-space discovery
    - Filtering
    - Search refinement

---

## 4. Content Model

### 4.1 Post

- Title
- Body
- Author (`@user`)
- Primary Space (`/space`)
- Secondary Spaces (optional)
- Tags (`#tag[]`)
- Created Timestamp
- Score / Ranking Value
- Status (active, removed, locked)

### 4.2 Comment

- Body
- Author (`@user`)
- Parent (post or comment)
- Created Timestamp

### 4.3 Space

- Name
- Slug (`/space`)
- Description
- Moderators
- Rules
- Related Spaces
- Follower Count

### 4.4 Tag

- Name
- Slug (`#tag`)
- Description (optional)
- Usage Count
- Alias Mapping (optional)

---

## 5. Classification Rules

### 5.1 Space Assignment

- Each post must have **one primary space**
- Additional spaces are optional (configurable)
- Spaces are selected from a **controlled pool**

### 5.2 Tag Assignment

- Posts may have multiple tags
- Tags may be:
    - Curated
    - User-suggested (if enabled)
- Tag count per post should be limited (e.g. 3–5)

---

## 6. Discovery Model

### 6.1 Space-Based Discovery

- Browse all posts within a space
- Example:
    - `/unreal` → all Unreal-related posts

### 6.2 Tag-Based Discovery

- Filter posts by tag
- Example:
    - `#networking` → all networking-related posts

### 6.3 Combined Queries

- Intersection of spaces and tags
- Examples:
    - `/unreal + #networking`
    - `/gamedev + #inventory`

### 6.4 Feed Generation

Feeds are generated from:

- Followed spaces
- Followed tags
- Global ranking signals

---

## 7. Moderation Model

### 7.1 Space Moderation

- Each space has assigned moderators
- Moderators control:
    - Post visibility
    - Rule enforcement
    - Tag usage within the space

### 7.2 Tag Governance

- Tags may be:
    - Approved
    - Merged
    - Aliased
    - Deprecated

### 7.3 Ownership Rules

- Primary space determines moderation authority
- Secondary spaces may provide visibility, not control

---

## 8. User Interaction

### 8.1 Following

Users can follow:

- Spaces (`/unreal`)
- Tags (`#networking`)
- Users (`@user`)

### 8.2 Mentions

- `@user` triggers notifications
- Used in posts and comments

### 8.3 Tagging

- Users select tags during post creation
- Tag suggestions may be submitted if missing

---

## 9. Navigation Structure

### 9.1 Space Pages

- `/space`
- Displays:
    - Top posts
    - Recent posts
    - Related tags
    - Rules and moderators

### 9.2 Tag Pages

- `#tag`
- Displays:
    - All posts with that tag
    - Related spaces

### 9.3 User Profiles

- `@user`
- Displays:
    - Posts
    - Comments
    - Followed spaces/tags

---

## 10. Constraints

- One primary space per post (required)
- Tag limit per post (recommended: 3–5)
- Spaces are controlled and curated
- Tag creation may be restricted or moderated

---

## 11. Design Principles

- **Post-first architecture**
- **Spaces define structure**
- **Tags define context**
- **Users define interaction**
- **Controlled taxonomy over freeform chaos**
- **Composable discovery (space + tag intersections)**

---

## 12. Summary

KBVE Forums is a **hybrid discussion platform** where:

- `/spaces` provide structured communities
- `#tags` provide flexible classification
- `@users` provide identity and interaction

This enables:

- Cross-domain discussions
- Better content discovery
- Scalable moderation
- Flexible, future-proof architecture
