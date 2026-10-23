-- Reference data (areas) and demo seed. Every seeded profile/gig/record is is_demo = true and badged in the UI.
-- Demo logins (public, for judges): demo.customer@sidegigs.app / demo.worker@sidegigs.app — password SideGigsDemo2026

insert into public.areas (slug, name, city, province, lat, lng) values
  ('soweto', 'Soweto', 'Johannesburg', 'Gauteng', -26.2485, 27.8540),
  ('alexandra', 'Alexandra', 'Johannesburg', 'Gauteng', -26.1036, 28.0975),
  ('sandton', 'Sandton', 'Johannesburg', 'Gauteng', -26.1076, 28.0567),
  ('randburg', 'Randburg', 'Johannesburg', 'Gauteng', -26.0936, 28.0064),
  ('rosebank', 'Rosebank', 'Johannesburg', 'Gauteng', -26.1467, 28.0436),
  ('braamfontein', 'Braamfontein', 'Johannesburg', 'Gauteng', -26.1929, 28.0339),
  ('joburg-cbd', 'Johannesburg CBD', 'Johannesburg', 'Gauteng', -26.2041, 28.0473),
  ('roodepoort', 'Roodepoort', 'Johannesburg', 'Gauteng', -26.1625, 27.8725),
  ('diepsloot', 'Diepsloot', 'Johannesburg', 'Gauteng', -25.9335, 28.0122),
  ('midrand', 'Midrand', 'Johannesburg', 'Gauteng', -25.9992, 28.1263),
  ('tembisa', 'Tembisa', 'Ekurhuleni', 'Gauteng', -25.9964, 28.2268),
  ('kempton-park', 'Kempton Park', 'Ekurhuleni', 'Gauteng', -26.1000, 28.2333),
  ('germiston', 'Germiston', 'Ekurhuleni', 'Gauteng', -26.2195, 28.1706),
  ('katlehong', 'Katlehong', 'Ekurhuleni', 'Gauteng', -26.3333, 28.1500),
  ('benoni', 'Benoni', 'Ekurhuleni', 'Gauteng', -26.1885, 28.3208),
  ('pretoria-cbd', 'Pretoria CBD', 'Pretoria', 'Gauteng', -25.7461, 28.1881),
  ('hatfield', 'Hatfield', 'Pretoria', 'Gauteng', -25.7487, 28.2380),
  ('mamelodi', 'Mamelodi', 'Pretoria', 'Gauteng', -25.7200, 28.3950),
  ('soshanguve', 'Soshanguve', 'Pretoria', 'Gauteng', -25.5236, 28.1000),
  ('centurion', 'Centurion', 'Pretoria', 'Gauteng', -25.8603, 28.1894),
  ('cape-town-cbd', 'Cape Town CBD', 'Cape Town', 'Western Cape', -33.9249, 18.4241),
  ('observatory', 'Observatory', 'Cape Town', 'Western Cape', -33.9380, 18.4700),
  ('langa', 'Langa', 'Cape Town', 'Western Cape', -33.9442, 18.5314),
  ('gugulethu', 'Gugulethu', 'Cape Town', 'Western Cape', -33.9833, 18.5667),
  ('bellville', 'Bellville', 'Cape Town', 'Western Cape', -33.9000, 18.6333),
  ('mitchells-plain', 'Mitchells Plain', 'Cape Town', 'Western Cape', -34.0470, 18.6180),
  ('khayelitsha', 'Khayelitsha', 'Cape Town', 'Western Cape', -34.0403, 18.6778),
  ('durban-cbd', 'Durban CBD', 'Durban', 'KwaZulu-Natal', -29.8587, 31.0218),
  ('umhlanga', 'Umhlanga', 'Durban', 'KwaZulu-Natal', -29.7270, 31.0850),
  ('kwamashu', 'KwaMashu', 'Durban', 'KwaZulu-Natal', -29.7446, 30.9820),
  ('pinetown', 'Pinetown', 'Durban', 'KwaZulu-Natal', -29.8166, 30.8500),
  ('umlazi', 'Umlazi', 'Durban', 'KwaZulu-Natal', -29.9700, 30.8850),
  ('gqeberha', 'Gqeberha', 'Gqeberha', 'Eastern Cape', -33.9608, 25.6022),
  ('bloemfontein', 'Bloemfontein', 'Bloemfontein', 'Free State', -29.0852, 26.1596),
  ('polokwane', 'Polokwane', 'Polokwane', 'Limpopo', -23.9045, 29.4689),
  ('mbombela', 'Mbombela', 'Mbombela', 'Mpumalanga', -25.4753, 30.9694)
on conflict (slug) do nothing;

-- Temporary seed helpers (dropped at the end of this migration).
create function private.seed_user(
  p_email text, p_password text, p_name text, p_role text, p_area text,
  p_headline text, p_bio text, p_skills text[]
) returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  v_id := public.create_account(p_email, p_password, p_name, p_role, p_area);
  update public.profiles
    set is_demo = true, headline = p_headline, bio = p_bio, skills = coalesce(p_skills, '{}'),
        created_at = now() - interval '120 days'
  where id = v_id;
  return v_id;
end $$;

create function private.seed_open_gig(
  p_customer uuid, p_title text, p_category text, p_description text, p_area text,
  p_days_ahead integer, p_window text, p_payout_rands integer, p_posted_hours_ago integer
) returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.gigs (id, customer_id, title, category, description, area_slug, scheduled_date, time_window, payout_cents, is_demo, created_at)
  values (v_id, p_customer, p_title, p_category, p_description, p_area,
          (now() at time zone 'Africa/Johannesburg')::date + p_days_ahead, p_window, p_payout_rands * 100, true,
          now() - make_interval(hours => p_posted_hours_ago));
  insert into public.gig_events (gig_id, actor_id, kind, created_at)
  values (v_id, p_customer, 'posted', now() - make_interval(hours => p_posted_hours_ago));
  return v_id;
end $$;

create function private.seed_completed_gig(
  p_customer uuid, p_worker uuid, p_title text, p_category text, p_description text, p_area text,
  p_days_ago integer, p_payout_rands integer, p_rating integer, p_review text
) returns uuid language plpgsql set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_done timestamptz := now() - make_interval(days => p_days_ago);
  v_created timestamptz := v_done - interval '3 days';
  v_matched timestamptz := v_created + interval '5 hours';
  v_name text;
  v_label text;
  v_code text;
  v_gig public.gigs;
begin
  insert into public.gigs (id, customer_id, title, category, description, area_slug, scheduled_date, time_window,
                           payout_cents, status, assigned_worker_id, is_demo, created_at, matched_at, started_at,
                           worker_done_at, completed_at)
  values (v_id, p_customer, p_title, p_category, p_description, p_area, (v_done at time zone 'Africa/Johannesburg')::date,
          'morning', p_payout_rands * 100, 'completed', p_worker, true, v_created, v_matched, v_done - interval '6 hours',
          v_done - interval '1 hour', v_done)
  returning * into v_gig;

  insert into public.gig_applications (gig_id, worker_id, message, status, created_at, updated_at)
  values (v_id, p_worker, null, 'accepted', v_created + interval '1 hour', v_matched);
  insert into public.transactions (gig_id, customer_id, worker_id, payout_cents, fee_cents, total_cents, status, created_at, settled_at)
  values (v_id, p_customer, p_worker, v_gig.payout_cents, v_gig.fee_cents, v_gig.total_cents, 'released', v_matched, v_done);

  select display_name into v_name from public.profiles where id = p_customer;
  v_label := split_part(v_name, ' ', 1)
    || case when position(' ' in v_name) > 0
         then ' ' || upper(left(regexp_replace(v_name, '^.*\s', ''), 1)) || '.' else '' end;
  v_code := 'SG-' || upper(left(encode(sha256(convert_to(v_id::text || p_worker::text || v_done::text, 'UTF8')), 'hex'), 10));

  insert into public.portfolio_items (worker_id, gig_id, title, category, area_slug, completed_at, customer_label,
                                      rating, review, record_code, is_demo, created_at)
  values (p_worker, v_id, p_title, p_category, p_area, v_done, v_label, p_rating, p_review, v_code, true, v_done);
  if p_rating is not null then
    insert into public.reviews (gig_id, reviewer_id, worker_id, rating, comment, created_at)
    values (v_id, p_customer, p_worker, p_rating, p_review, v_done + interval '2 hours');
  end if;

  insert into public.gig_events (gig_id, actor_id, kind, detail, created_at) values
    (v_id, p_customer, 'posted', null, v_created),
    (v_id, p_worker, 'applied', null, v_created + interval '1 hour'),
    (v_id, p_customer, 'matched', (select display_name from public.profiles where id = p_worker), v_matched),
    (v_id, p_customer, 'payment_held', null, v_matched),
    (v_id, p_worker, 'started', null, v_done - interval '6 hours'),
    (v_id, p_worker, 'worker_done', null, v_done - interval '1 hour'),
    (v_id, p_customer, 'completed', null, v_done),
    (v_id, p_customer, 'payment_released', null, v_done),
    (v_id, p_customer, 'portfolio_record', v_code, v_done);
  if p_rating is not null then
    insert into public.gig_events (gig_id, actor_id, kind, detail, created_at)
    values (v_id, p_customer, 'reviewed', p_rating::text, v_done + interval '2 hours');
  end if;
  return v_id;
end $$;

do $$
declare
  pw text := 'SideGigsDemo2026';
  thandi uuid; sipho uuid;
  lerato uuid; ayanda uuid; kagiso uuid; nomsa uuid; themba uuid;
  dudu uuid; bongani uuid; kasi uuid; grace uuid; fatima uuid; lindiwe uuid; jason uuid;
  g uuid;
begin
  -- Demo logins
  thandi := private.seed_user('demo.customer@sidegigs.app', pw, 'Thandi Mokoena', 'customer', 'soweto',
    'Mom of two, always fixing up the house', 'I hire local help for the garden, painting and repairs around our home in Orlando East.', '{}');
  sipho := private.seed_user('demo.worker@sidegigs.app', pw, 'Sipho Dlamini', 'worker', 'soweto',
    'Painter & handyman — 6 years of jobs around Soweto',
    'I paint houses and shops, fix doors and cupboards, and help people move. I bring my own tools and I clean up after myself.',
    array['painting', 'repairs', 'moving', 'gardening']);

  -- Other demo workers (no public login)
  lerato := private.seed_user('lerato.demo@sidegigs.app', gen_random_uuid()::text, 'Lerato Khumalo', 'worker', 'alexandra',
    'Braids, natural hair & home cleaning', 'Hairdresser by trade, cleaner on weekends. Punctual and careful with your home.',
    array['hair-beauty', 'cleaning']);
  ayanda := private.seed_user('ayanda.demo@sidegigs.app', gen_random_uuid()::text, 'Ayanda Nkosi', 'worker', 'braamfontein',
    'BSc student · maths tutor & laptop fixer', 'Third-year science student. I tutor Grade 8–12 maths and science and sort out slow laptops and Wi-Fi.',
    array['tutoring', 'tech-support']);
  kagiso := private.seed_user('kagiso.demo@sidegigs.app', gen_random_uuid()::text, 'Kagiso Molefe', 'worker', 'tembisa',
    'Mobile mechanic — services, brakes, batteries', 'Ten years in a workshop, now mobile. I come to you with my tools.',
    array['automotive', 'repairs']);
  nomsa := private.seed_user('nomsa.demo@sidegigs.app', gen_random_uuid()::text, 'Nomsa Zulu', 'worker', 'umlazi',
    'Home cook for events up to 80 guests', 'Traditional and modern dishes for family events, funerals, weddings and baby showers.',
    array['catering', 'cleaning']);
  themba := private.seed_user('themba.demo@sidegigs.app', gen_random_uuid()::text, 'Themba Mahlangu', 'worker', 'randburg',
    'Garden clean-ups, planting & rubble removal', 'I turn overgrown yards into gardens you can use. Own bakkie for rubble.',
    array['gardening', 'moving']);

  -- Demo customers
  dudu := private.seed_user('dudu.demo@sidegigs.app', gen_random_uuid()::text, 'Dudu Ndlovu', 'customer', 'soweto',
    'Owner, Mama Dudu''s Spaza', null, '{}');
  bongani := private.seed_user('bongani.demo@sidegigs.app', gen_random_uuid()::text, 'Bongani Sithole', 'customer', 'midrand',
    'Just moved to Midrand', null, '{}');
  kasi := private.seed_user('kasi.demo@sidegigs.app', gen_random_uuid()::text, 'Kasi Coffee Co.', 'customer', 'alexandra',
    'Small coffee shop on 7th Avenue', null, '{}');
  grace := private.seed_user('grace.demo@sidegigs.app', gen_random_uuid()::text, 'Grace Community Church', 'customer', 'tembisa',
    'Community church & soup kitchen', null, '{}');
  fatima := private.seed_user('fatima.demo@sidegigs.app', gen_random_uuid()::text, 'Fatima Patel', 'customer', 'rosebank',
    'Parent of a Grade 10 learner', null, '{}');
  lindiwe := private.seed_user('lindiwe.demo@sidegigs.app', gen_random_uuid()::text, 'Lindiwe Mthembu', 'customer', 'umlazi',
    'Family events organiser', null, '{}');
  jason := private.seed_user('jason.demo@sidegigs.app', gen_random_uuid()::text, 'Jason Pillay', 'customer', 'observatory',
    'Runs a small online clothing brand', null, '{}');

  -- Completed history → verified portfolio records
  perform private.seed_completed_gig(grace, sipho, 'Paint church hall ceiling', 'painting',
    'Repaint the main hall ceiling (white) — scaffolding available on site.', 'tembisa', 90, 1500, 5, null);
  perform private.seed_completed_gig(dudu, sipho, 'Paint spaza shop interior', 'painting',
    'Paint the inside walls of the spaza and the counter. Stock must be covered.', 'soweto', 62, 1200, 5,
    'Sipho arrived early, covered all the stock and the finish is beautiful. Customers keep complimenting the shop.');
  perform private.seed_completed_gig(bongani, sipho, 'Help move furniture into new flat', 'moving',
    'Carry a couch, fridge, bed and boxes up to a second-floor flat.', 'midrand', 45, 600, 5,
    'Careful with everything, nothing scratched. Would hire again.');
  perform private.seed_completed_gig(thandi, sipho, 'Fix sagging kitchen cupboard doors', 'repairs',
    'Four cupboard doors hang skew and one hinge is broken.', 'soweto', 30, 350, 4,
    'Good work and a fair price. Took a bit longer than planned but he explained why.');
  perform private.seed_completed_gig(dudu, sipho, 'Repaint burglar bars and front gate', 'painting',
    'Sand and repaint the burglar bars on four windows and the front gate.', 'soweto', 12, 700, 5,
    'Second job with Sipho — reliable as always.');

  perform private.seed_completed_gig(fatima, lerato, 'Knotless braids for matric dance', 'hair-beauty',
    'Mid-back knotless braids, hair supplied.', 'rosebank', 40, 650, 5, 'Neat, fast and so friendly.');
  perform private.seed_completed_gig(kasi, lerato, 'Deep clean café after renovation', 'cleaning',
    'Builders just left. Floors, windows, kitchen and extractor fan need a deep clean.', 'alexandra', 20, 800, 5,
    'Spotless. She even cleaned the extractor fan.');
  perform private.seed_completed_gig(thandi, lerato, 'Spring clean before family visit', 'cleaning',
    'Full clean of a 3-bedroom house including windows and the fridge.', 'soweto', 8, 700, 4, 'Very thorough.');

  perform private.seed_completed_gig(fatima, ayanda, 'Grade 11 maths revision (3 sessions)', 'tutoring',
    'Functions and trigonometry revision before exams.', 'rosebank', 60, 750, 5, 'Patient and clear.');
  perform private.seed_completed_gig(fatima, ayanda, 'Grade 11 physical sciences exam prep', 'tutoring',
    'Two sessions on mechanics and electricity before the June exam.', 'rosebank', 25, 600, 5,
    'My son''s mark went from 48% to 67%.');
  perform private.seed_completed_gig(bongani, ayanda, 'Set up home Wi-Fi and fix slow laptop', 'tech-support',
    'Router in the wrong place and a laptop that takes 10 minutes to start.', 'midrand', 15, 450, 5,
    'Explained everything in plain language.');

  perform private.seed_completed_gig(grace, kagiso, 'Replace minibus battery and check brakes', 'automotive',
    'Church Quantum will not start in the mornings; brakes squeak.', 'tembisa', 33, 550, 4,
    'Knows his stuff. Brought the right battery.');
  perform private.seed_completed_gig(bongani, kagiso, 'Minor service on a Polo Vivo', 'automotive',
    'Oil, filters and plugs. I have the parts.', 'midrand', 18, 800, 5, 'Cheaper than the dealership and just as good.');

  perform private.seed_completed_gig(lindiwe, nomsa, 'Cook for a 40-person family gathering', 'catering',
    'Umngqusho, chicken, salads and dessert for 40 people.', 'umlazi', 50, 2500, 5,
    'The food was finished in an hour — everyone asked who cooked!');
  perform private.seed_completed_gig(lindiwe, nomsa, 'Catering for baby shower (25 guests)', 'catering',
    'Finger foods and a cake table for 25 guests.', 'umlazi', 10, 1500, 5,
    'Came back to Nomsa because she never disappoints.');

  perform private.seed_completed_gig(thandi, themba, 'Trim hedges and plant spinach beds', 'gardening',
    'Front hedge trimming and two new vegetable beds at the back.', 'soweto', 55, 450, 5, 'My garden has never looked better.');
  perform private.seed_completed_gig(bongani, themba, 'Garden clean-up and rubble removal', 'gardening',
    'Overgrown yard plus a pile of building rubble to remove.', 'midrand', 22, 700, 4, 'Hard worker, left the yard neat.');

  -- Open gigs for discovery
  perform private.seed_open_gig(dudu, 'Repaint spaza shop front and signage', 'painting',
    'The front wall of our spaza (about 12 m²) needs repainting and the shop name redone in bright colours. Paint is bought — please bring brushes and rollers.',
    'soweto', 3, 'morning', 850, 5);
  perform private.seed_open_gig(dudu, 'Fix a leaking kitchen tap', 'repairs',
    'The kitchen mixer tap drips all day. Probably needs a new washer or cartridge — please bring basic plumbing tools.',
    'soweto', 2, 'afternoon', 300, 20);
  perform private.seed_open_gig(bongani, 'Assemble a flat-pack wardrobe and double bed', 'repairs',
    'Two flat-pack items still in boxes. All screws included; I have a drill you can use.',
    'midrand', 4, 'morning', 400, 9);
  perform private.seed_open_gig(bongani, 'Laptop clean-up and Wi-Fi printer setup', 'tech-support',
    'Old laptop is very slow and the new printer will not connect to Wi-Fi. Need both sorted.',
    'midrand', 2, 'evening', 350, 30);
  perform private.seed_open_gig(kasi, 'Market-day helper: serve coffee and pack stock', 'catering',
    'Saturday market stall from 7am to 2pm. Serve customers, keep the stall clean and pack up afterwards.',
    'alexandra', 5, 'morning', 600, 14);
  perform private.seed_open_gig(kasi, 'Braids for three staff before our launch', 'hair-beauty',
    'Simple, neat braids for three staff members before our café relaunch. Hair will be supplied.',
    'alexandra', 5, 'afternoon', 750, 26);
  perform private.seed_open_gig(grace, 'Carry and set up 200 chairs for a community event', 'moving',
    'Move chairs from the storeroom to the hall and back after the event. Two people would be ideal.',
    'tembisa', 6, 'afternoon', 350, 40);
  perform private.seed_open_gig(grace, 'Service check and oil change on church minibus', 'automotive',
    'Toyota Quantum due for an oil change and general check. Parts will be bought before the day.',
    'tembisa', 8, 'morning', 450, 50);
  perform private.seed_open_gig(fatima, 'Grade 10 maths tutoring (two 90-minute sessions)', 'tutoring',
    'My daughter needs help with algebra and exponents before her test. Sessions at our home after school.',
    'rosebank', 3, 'evening', 500, 7);
  perform private.seed_open_gig(lindiwe, 'Deep clean a 2-bedroom flat before move-in', 'cleaning',
    'Empty flat, needs floors, kitchen, bathroom and windows cleaned. Cleaning products provided.',
    'umlazi', 4, 'morning', 650, 12);
  perform private.seed_open_gig(jason, 'Photograph 20 products for our online store', 'photography',
    'Clean white-background photos of 20 clothing items. Must have your own camera or a good phone and lighting.',
    'observatory', 7, 'flexible', 900, 16);

  -- Demo customer's open gig with two applicants (hiring flow ready to try)
  g := private.seed_open_gig(thandi, 'Clear and replant my backyard vegetable garden', 'gardening',
    'Our backyard beds are overgrown. Clear the weeds, turn the soil and plant spinach and onion seedlings (I have the seedlings).',
    'soweto', 3, 'morning', 500, 18);
  insert into public.gig_applications (gig_id, worker_id, message, created_at) values
    (g, themba, 'I have planted veggie beds in Soweto before — happy to bring compost too.', now() - interval '16 hours'),
    (g, sipho, 'I can do this on the day. I live close by in Soweto.', now() - interval '10 hours');
  insert into public.gig_events (gig_id, actor_id, kind, created_at) values
    (g, themba, 'applied', now() - interval '16 hours'),
    (g, sipho, 'applied', now() - interval '10 hours');

  -- Demo worker's matched gig (start → done → confirm flow ready to try)
  g := private.seed_open_gig(thandi, 'Paint front gate and burglar bars', 'painting',
    'Sand and paint the front gate and the burglar bars on three windows. I have bought black enamel paint.',
    'soweto', 1, 'morning', 600, 30);
  insert into public.gig_applications (gig_id, worker_id, message, status, created_at, updated_at)
  values (g, sipho, 'I did the same job for Mama Dudu — see my portfolio.', 'accepted', now() - interval '26 hours', now() - interval '2 hours');
  update public.gigs set status = 'matched', assigned_worker_id = sipho, matched_at = now() - interval '2 hours' where id = g;
  insert into public.transactions (gig_id, customer_id, worker_id, payout_cents, fee_cents, total_cents, created_at)
  select id, customer_id, sipho, payout_cents, fee_cents, total_cents, now() - interval '2 hours' from public.gigs where id = g;
  insert into public.gig_events (gig_id, actor_id, kind, detail, created_at) values
    (g, sipho, 'applied', null, now() - interval '26 hours'),
    (g, thandi, 'matched', 'Sipho Dlamini', now() - interval '2 hours'),
    (g, thandi, 'payment_held', null, now() - interval '2 hours');
end $$;

drop function private.seed_user(text, text, text, text, text, text, text, text[]);
drop function private.seed_open_gig(uuid, text, text, text, text, integer, text, integer, integer);
drop function private.seed_completed_gig(uuid, uuid, text, text, text, text, integer, integer, integer, text);
