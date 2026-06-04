-- Seed vault_accounts with the initial credentials list.
-- Safe to re-run: uses ON CONFLICT DO NOTHING via unique (name, username) compound.

-- First add the dedup constraint so re-runs are idempotent
alter table vault_accounts drop constraint if exists vault_accounts_name_user_uniq;
alter table vault_accounts add constraint vault_accounts_name_user_uniq unique nulls not distinct (name, username);

insert into vault_accounts (category, name, username, password, passkey, url) values
-- EMAIL
('Email', 'Google',                'Lacey@laceynprice.com',              'Fuckingfuckers',     null, null),
('Email', 'Florida Realtors',      '255504362',                          'Mymonkeys1',         null, null),
('Email', 'Forms Simplicity',      '1236665',                            'FUCKINGHELL1!',      null, null),
('Email', 'MyFloridaLicense',      'lacey@laceynprice.com',              'fuckingtheifs',      null, 'https://www.myfloridalicense.com/'),
('Email', 'LOE Google',            'liberationofeducation@gmail.com',    'Fuckingtheifs',      null, null),
('Email', 'LOE Google',            'Info@liberationofeducation.org',     'Fuckinghell',        null, null),
('Email', 'PHPF Google',           'info@projecthpf.org',                'Fuckingpeacephpf',   null, null),
('Email', 'PHPF Google',           'projecthpf421@gmail.com',            'ProjectHPF2025!',    null, null),
('Email', 'Proton',                'lacey@laceynprice.com',              'Fuckingtheifs',      'discover zoo mule forum hub just nephew guilt smooth nothing parrot spoil', null),
('Email', 'FL DMV',                'lacey@laceynprice.com',              'Fuckingtheifs!1',    null, null),
('Email', 'FLEXMLS',               'ecn.e4362',                          'Fuckingtheifs1',     null, null),
('Email', 'MyGovOnline DPG',       'thegasologist@gmail.com',            'Fuckingtheifs1',     null, null),
-- BANKING
('Banking', 'Synovus',             'pricelacey',                         'Fuckingshit1!',      null, null),
('Banking', 'Synovus',             'pricelaceyn',                        'Fuckingtheifs!1',    null, null),
('Banking', 'Eglin',               'FuckThemFuckers',                    'Fuckinghell!1',      null, null),
('Banking', 'WeBull',              'lacey@laceynprice.com',              'Fuckingtheifs!1',    null, null),
('Banking', 'Wave',                'lacey@laceynprice.com',              'Fuckingtheifs',      null, null),
('Banking', 'Stripe',              'login with google',                  null,                 'tvxa-rzqi-qfcs-pjds-iofs', null),
-- PAYMENT PROCESSORS
('Payment Processors', 'Paypal',   null,                                  null,                null, null),
('Payment Processors', 'Zelle',    null,                                  null,                null, null),
-- UTILITIES
('Utilities', 'Waste Pro',         'lacey@laceynprice.com',              'Fuckingtheifs!1',    null, null),
('Utilities', 'FPL',               'lacey@laceynprice.com',              null,                 null, null),
('Utilities', 'Starlink',          'lacey@laceynprice.com',              'Fuckingtheifs',      null, null),
('Utilities', 'COX',               'laceyprice',                         'kdliadjf1',          null, null),
-- INSURANCE
('Insurance', 'Direct Auto',       'lacey@laceynprice.com',              'Fuckingtheifs!',     null, null),
('Insurance', 'Progressive',       'danielbprice',                       'Getrobbed83!',       'Getrobbed83!', null),
-- SOCIAL MEDIA
('Social Media', 'LOE X',          'liberationofeducation',              'Fuckingfuckers',     'Fuckingfuckers', null),
('Social Media', 'Facebook',       'lacey@laceynprice.com',              'Fuckthemfuckers!',   null, null),
('Social Media', 'Instagram',      'lacey@laceynprice.com',              'Fuckingtheifs',      'Fuckingtheifs', null),
('Social Media', 'MetaMask',       'lacey@laceynprice.com',              'Fuckingtheifs1!',    '1. unaware 2. bacon 3. vehicle 4. renew 5. chase 6. page 7. when 8. rescue 9. boat 10. cook 11. fly 12. book', null),
('Social Media', 'Discord',        null,                                  'Fuckingtheifs1!',   null, null),
-- BUSINESS / DEV TOOLS
('Business', 'Element X',          'Login with Google',                  null,                 'EsTx rRMj RQvo ivYt D97b tuJF 1hXz 5MXv MFtp 9Wh6 999R 3Nkm', null),
('Business', 'Clerk of Court',     'laceynprice@pm.me',                  'Fuckingtheifs1',     null, null),
('Business', 'NameCheap',          'laceyprice',                         'Fuckingtheifs1!',    null, null),
('Business', 'Ferguson Build.com', 'lacey@laceynprice.com',              'fuckingtheifs',      null, null),
('Business', 'Microsoft',          'lacey@laceynprice.com',              null,                 null, null),
('Business', 'Amelia Microsoft',   'ameliamylaprice@gmail.com',          'Fuckingshit',        null, null),
('Business', 'TLC',                'Info@TLCVR.co',                      'tlcvacay2025!',      null, null),
('Business', 'MyFloridaLicense',   'lacey@laceynprice.com',              'fuckingtheifs',      null, null),
('Business', 'Securus',            null,                                  'Fuckingtheifs1!',   null, null),
('Business', 'GitHub',             'login with google',                  null,                 null, null),
('Business', 'Supabase',           'login with github',                  null,                 'Database: WdicAEF0K0KQM0i0', null),
('Business', 'Docker',             'login with github',                  null,                 null, null),
('Business', 'Cloudflare',         'login with google',                  null,                 null, null),
('Business', 'Twilio',             'login with google',                  null,                 'QPMP8UMUWCZ5Q2U66PK25KWK', 'https://console.twilio.com/'),
('Business', 'Resend',             'login with github',                  null,                 null, 'https://resend.com/'),
('Business', 'Plaid',              'login with google',                  null,                 null, 'plaid.com'),
('Business', 'Flux',               'login with google',                  null,                 null, null),
-- ENTERTAINMENT
('Entertainment', 'Hulu',          'lacey@laceynpric.com',               null,                 null, null)
on conflict on constraint vault_accounts_name_user_uniq do nothing;
