-- Bildprompt und Herkunft am generierten Bild festhalten.
--
-- Bisher war der Prompt fluechtig: er entstand in api/inventar/artwork aus der Objektzeile,
-- ging an OpenAI und war danach weg. Damit ist genau das unmoeglich, was man nach dem
-- ersten Versuch eigentlich will -- "nochmal, aber dunkler". Man kann einen Prompt nicht
-- verfeinern, den niemand mehr kennt.
--
-- `basis_bild_id` haelt die Kette fest: welches Bild war die Vorlage. Mit `on delete set null`,
-- weil das Loeschen einer Vorlage das daraus entstandene Artwork nicht mitreissen darf --
-- die Herkunft ist dann unbekannt, das Bild bleibt.
alter table valuable_images add column if not exists prompt text;
alter table valuable_images add column if not exists basis_bild_id uuid
  references valuable_images(id) on delete set null;

-- `hinweis` getrennt vom vollen Prompt: der volle Prompt ist lang und zu 80 % Stilbaustein,
-- der Hinweis ist der eine Satz, den Eric (oder Athena) dazugesagt hat. Fuer die Anzeige im
-- UI und fuer die naechste Runde zaehlt genau dieser Satz.
alter table valuable_images add column if not exists hinweis text;

create index if not exists valuable_images_basis_idx
  on valuable_images (basis_bild_id) where basis_bild_id is not null;
