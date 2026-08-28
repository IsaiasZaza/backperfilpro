-- Estilo visual por depoimento (layout, padding, spacing). NULL = herda padrao da secao / front.

ALTER TABLE testimonials
  ADD COLUMN IF NOT EXISTS layout TEXT CHECK (layout IS NULL OR layout IN ('stack', 'quote')),
  ADD COLUMN IF NOT EXISTS padding TEXT CHECK (padding IS NULL OR padding IN ('sm', 'md', 'lg')),
  ADD COLUMN IF NOT EXISTS spacing TEXT CHECK (spacing IS NULL OR spacing IN ('sm', 'md', 'lg'));
