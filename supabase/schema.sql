-- Схема pulka: игры, сдачи, статистика
-- Каждая игра принадлежит пользователю Supabase Auth (auth.uid())

CREATE SCHEMA IF NOT EXISTS pulka;
GRANT USAGE ON SCHEMA pulka TO anon, authenticated;

-- Таблица games: одна строка на партию
CREATE TABLE IF NOT EXISTS pulka.games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Настройки игры (снимок на момент старта)
    players JSONB NOT NULL,           -- {A: "Андрей", B: "Дима", C: "Олег"}
    pool_limit INTEGER NOT NULL,
    first_hand_start TEXT NOT NULL,   -- "A" / "B" / "C"
    -- Текущее состояние (для быстрой загрузки без replay всех deals)
    state JSONB NOT NULL,             -- {pool, mount, whists, firstHand, raspasState, ...}
    -- Статус
    finished BOOLEAN NOT NULL DEFAULT false,
    finished_at TIMESTAMPTZ,
    -- Метки
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_games_owner ON pulka.games(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_finished ON pulka.games(owner_id, finished, finished_at DESC);

-- Таблица deals: все сдачи партии
CREATE TABLE IF NOT EXISTS pulka.deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES pulka.games(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,             -- порядковый номер в партии (1, 2, 3...)
    deal_data JSONB NOT NULL,         -- полный Deal объект
    delta JSONB,                      -- дельта после применения
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(game_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_deals_game ON pulka.deals(game_id, seq);

-- Trigger: обновление updated_at
CREATE OR REPLACE FUNCTION pulka.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_games_updated ON pulka.games;
CREATE TRIGGER trg_games_updated
    BEFORE UPDATE ON pulka.games
    FOR EACH ROW EXECUTE FUNCTION pulka.update_updated_at();

-- Row Level Security: каждый пользователь видит только свои игры
ALTER TABLE pulka.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulka.deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS games_owner_all ON pulka.games;
CREATE POLICY games_owner_all ON pulka.games
    FOR ALL
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS deals_owner_all ON pulka.deals;
CREATE POLICY deals_owner_all ON pulka.deals
    FOR ALL
    USING (EXISTS (SELECT 1 FROM pulka.games g WHERE g.id = game_id AND g.owner_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM pulka.games g WHERE g.id = game_id AND g.owner_id = auth.uid()));

-- Права для аутентифицированных пользователей
GRANT SELECT, INSERT, UPDATE, DELETE ON pulka.games TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pulka.deals TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA pulka TO authenticated;

-- Разрешить PostgREST видеть схему
NOTIFY pgrst, 'reload schema';
