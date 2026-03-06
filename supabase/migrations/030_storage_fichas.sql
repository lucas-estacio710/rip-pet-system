-- Bucket para fichas de remocao (imagens PNG)
INSERT INTO storage.buckets (id, name, public)
VALUES ('fichas', 'fichas', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users podem fazer upload
CREATE POLICY "Authenticated upload fichas"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'fichas');

-- Authenticated users podem ler
CREATE POLICY "Authenticated read fichas"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'fichas');

-- Authenticated users podem deletar (regenerar)
CREATE POLICY "Authenticated delete fichas"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'fichas');

-- Acesso publico para leitura (compartilhar via link)
CREATE POLICY "Public read fichas"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'fichas');
