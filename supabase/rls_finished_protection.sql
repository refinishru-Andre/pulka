-- Защита завершённых партий на уровне БД.
-- Разрешаем UPDATE только если партия НЕ завершена ЛИБО игрок делает finished=false→true
-- (то есть можно только "завершить", но не изменить содержимое завершённой).

DROP POLICY IF EXISTS games_owner_all ON pulka.games;

-- SELECT — свои игры
CREATE POLICY games_owner_select ON pulka.games
    FOR SELECT
    USING (owner_id = auth.uid());

-- INSERT — свои игры
CREATE POLICY games_owner_insert ON pulka.games
    FOR INSERT
    WITH CHECK (owner_id = auth.uid());

-- UPDATE — только если ТЕКУЩЕЕ значение finished=false
-- То есть завершённые нельзя изменить (кроме случая когда сам ставит finished=true в этом же UPDATE)
CREATE POLICY games_owner_update ON pulka.games
    FOR UPDATE
    USING (owner_id = auth.uid() AND finished = false)
    WITH CHECK (owner_id = auth.uid());

-- DELETE — свои игры (даже завершённые)
CREATE POLICY games_owner_delete ON pulka.games
    FOR DELETE
    USING (owner_id = auth.uid());

-- То же для deals
DROP POLICY IF EXISTS deals_owner_all ON pulka.deals;

CREATE POLICY deals_owner_select ON pulka.deals
    FOR SELECT
    USING (EXISTS (SELECT 1 FROM pulka.games g WHERE g.id = game_id AND g.owner_id = auth.uid()));

CREATE POLICY deals_owner_insert ON pulka.deals
    FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM pulka.games g WHERE g.id = game_id AND g.owner_id = auth.uid() AND g.finished = false));

CREATE POLICY deals_owner_delete ON pulka.deals
    FOR DELETE
    USING (EXISTS (SELECT 1 FROM pulka.games g WHERE g.id = game_id AND g.owner_id = auth.uid() AND g.finished = false));

NOTIFY pgrst, 'reload schema';
