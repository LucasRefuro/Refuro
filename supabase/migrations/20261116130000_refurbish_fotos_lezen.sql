-- Foto's in de opslag (bucket refurbish-fotos) konden niet weg vanuit de app.
--
-- Er was een regel voor toevoegen en een voor wissen, maar niet voor lezen. De Storage-API zoekt
-- bij remove() eerst de bestanden op, en zonder leesregel vindt hij er nul: dan wist hij niets en
-- geeft hij ook geen fout. Zo bleven foto's die je weghaalde (en de halve set na een mislukte
-- import) stil in de opslag staan. Ontdekt op 16 november bij het vervangen van de iPhone-sets.
--
-- Lezen alleen in de eigen map van de winkel, net als toevoegen en wissen. De bucket is openbaar
-- (de webshop laadt de foto's via een openbare link), dus dit geeft niemand iets te zien wat hij
-- nu niet al kan zien; het maakt alleen het opruimen mogelijk.
drop policy if exists refurbish_fotos_lezen on storage.objects;
create policy refurbish_fotos_lezen on storage.objects for select to authenticated
  using (bucket_id = 'refurbish-fotos' and (storage.foldername(name))[1] = (public.my_team_id())::text);
