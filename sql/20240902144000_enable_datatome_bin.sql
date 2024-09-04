-- Extensions Check
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_jsonschema SCHEMA extensions;

-- JSON Schema Definition Table (Check for existence)
CREATE TABLE IF NOT EXISTS json_schemas (
    schema_name TEXT PRIMARY KEY,
    schema JSONB NOT NULL
);

-- Insert a JSON Schema for datatome, only if it doesn't already exist
INSERT INTO json_schemas (schema_name, schema)
    SELECT 'datatome_schema', '{
        "type": "object",
        "properties": {
            "datatome": { "type": "string" }
        },
        "required": ["datatome"]
    }'
    WHERE NOT EXISTS (
        SELECT 1 FROM json_schemas WHERE schema_name = 'datatome_schema'
);

-- Main Table for storing datatome data
CREATE TABLE IF NOT EXISTS datatome_bin (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE,
    datatome JSONB NOT NULL,
    
    -- Constraints
    CONSTRAINT datatome_size CHECK (octet_length(datatome::text) > 10 AND octet_length(datatome::text) < 10000)

);

-- Trigger for handling last updated timestamp
CREATE TRIGGER IF NOT EXISTS handle_last_updated_datatome_bin
    BEFORE UPDATE ON datatome_bin
    FOR EACH ROW
    EXECUTE PROCEDURE moddatetime(created_at);

-- Function to validate JSON schema
CREATE OR REPLACE FUNCTION validate_datatome_json_schema()
    RETURNS TRIGGER AS $$
        BEGIN
            PERFORM json_schema_valid(
                (SELECT schema FROM json_schemas WHERE schema_name = 'datatome_schema'),
                NEW.datatome
            );

            IF NOT FOUND THEN
                RAISE EXCEPTION 'JSON data does not conform to the schema';
            END IF;

            RETURN NEW;
        END;
    $$ LANGUAGE plpgsql;

-- Trigger to validate JSON data on insert and update
CREATE TRIGGER IF NOT EXISTS validate_datatome_json
    BEFORE INSERT OR UPDATE ON datatome_bin
    FOR EACH ROW
    EXECUTE FUNCTION validate_datatome_json_schema();

-- Enable Row Level Security
ALTER TABLE datatome_bin ENABLE ROW LEVEL SECURITY;

-- Revoke default public access
REVOKE ALL ON TABLE datatome_bin FROM public;

-- Grant select access to authenticated and anonymous users
GRANT SELECT ON TABLE datatome_bin TO authenticated, anon;

-- Policy for allowing specific UUID selection by authenticated and anonymous users
CREATE POLICY "Anyone can view datatomes." ON datatome_bin
    FOR SELECT
    TO authenticated, anon
    USING (id = current_setting('app.query_id')::UUID);

-- Policy for allowing authenticated and anonymous users to insert data
CREATE POLICY "Authenticated and Guests Can Insert" ON datatome_bin
    FOR INSERT
    TO authenticated, anon
    USING (true);
