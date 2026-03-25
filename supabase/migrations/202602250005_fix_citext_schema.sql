-- Revert citext back to public schema.
-- citext is used as a column type and in ::citext casts throughout the codebase.
-- Moving it to extensions breaks all functions with SET search_path = app, public
-- since they can no longer resolve the citext type.
-- The "extension in public schema" linter warning is INFO-level and acceptable
-- given the deep integration of citext across tables and functions.

ALTER EXTENSION citext SET SCHEMA public;
