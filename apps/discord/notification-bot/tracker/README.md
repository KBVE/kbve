# Tracker Schema

This folder contains the database schema definitions for the `tracker` schema in Supabase.

## Overview

The `tracker` schema is designed for service-level operations and is only accessible via the service role key. It contains tables for managing distributed system coordination and internal service operations.

## Access Control

- **Service Role**: Full access (SELECT, INSERT, UPDATE, DELETE)
- **Anon Role**: No access
- **Authenticated Role**: No access

## Tables

- `cluster_management`: Discord bot shard coordination across clusters