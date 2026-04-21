-- ============================================
-- Supabase Storage 버킷 설정 (1회 실행)
-- Supabase Dashboard → SQL Editor 에서 실행
-- ============================================

-- 1) photos 버킷 생성 (public 읽기)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('photos', 'photos', true, 204800)  -- 200KB 제한
ON CONFLICT (id) DO NOTHING;

-- 2) 인증된 유저: 본인 폴더에만 업로드 가능
CREATE POLICY "Users upload own photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3) 누구나 사진 조회 가능 (public bucket)
CREATE POLICY "Public photo read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'photos');

-- 4) 인증된 유저: 본인 사진만 삭제 가능
CREATE POLICY "Users delete own photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================
-- 무료 티어 용량 계산:
--   Storage 1GB / (200KB x 3장) = 약 1,700명 수용
--   Bandwidth 5GB/월 (CDN 캐시로 실사용 훨씬 적음)
-- ============================================
