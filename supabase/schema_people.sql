-- Справочник игроков. Каждый пользователь (owner) держит свой список.
-- name — нормализованный (trim + первая заглавная), name_lc — для сравнения.

CREATE TABLE IF NOT EXISTS pulka.people (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    name_lc TEXT NOT NULL,           -- lowercase, для проверки уникальности
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner_id, name_lc)
);

CREATE INDEX IF NOT EXISTS idx_people_owner ON pulka.people(owner_id, name);

ALTER TABLE pulka.people ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS people_owner_all ON pulka.people;
CREATE POLICY people_owner_all ON pulka.people
    FOR ALL
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON pulka.people TO authenticated;

NOTIFY pgrst, 'reload schema';
