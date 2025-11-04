const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '..', '2025-10-31_seed_fake_users.sql');
const PASSWORD_HASH = '$2a$10$dUwFr.zyhJ7K6aw0yzNXJeU8/Gez8AkXHq4oqezm1/6MY373HJNqO';
const EMAIL_DOMAIN = 'sunion-fake.com';

const countryConfigs = [
  { country: 'Greece', cities: ['Athens', 'Thessaloniki', 'Patras', 'Heraklion', 'Chania'], count: 10, segment: 'europe' },
  { country: 'Spain', cities: ['Barcelona', 'Madrid', 'Valencia', 'Seville'], count: 5, segment: 'europe' },
  { country: 'Italy', cities: ['Rome', 'Milan', 'Florence', 'Bologna'], count: 5, segment: 'europe' },
  { country: 'France', cities: ['Paris', 'Lyon', 'Nice'], count: 4, segment: 'europe' },
  { country: 'Germany', cities: ['Berlin', 'Munich', 'Hamburg'], count: 4, segment: 'europe' },
  { country: 'Netherlands', cities: ['Amsterdam', 'Rotterdam', 'Utrecht'], count: 3, segment: 'europe' },
  { country: 'Sweden', cities: ['Stockholm', 'Gothenburg', 'Malmo'], count: 3, segment: 'europe' },
  { country: 'Portugal', cities: ['Lisbon', 'Porto', 'Faro'], count: 3, segment: 'europe' },
  { country: 'Poland', cities: ['Warsaw', 'Krakow', 'Gdansk'], count: 3, segment: 'europe' },
  { country: 'Czech Republic', cities: ['Prague', 'Brno', 'Ostrava'], count: 3, segment: 'europe' },
  { country: 'Philippines', cities: ['Manila', 'Cebu', 'Davao', 'Makati', 'Bonifacio'], count: 10, segment: 'asia-philippines' },
  { country: 'Thailand', cities: ['Bangkok', 'Chiang Mai', 'Phuket'], count: 3, segment: 'asia' },
  { country: 'Singapore', cities: ['Singapore'], count: 2, segment: 'asia' },
  { country: 'Malaysia', cities: ['Kuala Lumpur', 'Penang', 'Johor Bahru'], count: 2, segment: 'asia' },
];

const namePools = {
  defaultEurope: {
    male: ['Adrien', 'Roman', 'Stefan', 'Marek', 'Jonas', 'Filip', 'Emil', 'Victor', 'Samuel', 'Oliver', 'Hugo', 'Damian'],
    female: ['Amelia', 'Elena', 'Clara', 'Mira', 'Natalie', 'Emilia', 'Sonia', 'Alina', 'Petra', 'Veronica', 'Iris', 'Sabina'],
  },
  defaultAsia: {
    male: ['Kenji', 'Ravi', 'Arun', 'Tarek', 'Hiro', 'Suraj', 'Wei', 'Jun', 'Daniel', 'Aaron', 'Yuto', 'Imran'],
    female: ['Hana', 'Lina', 'Ami', 'Suki', 'Aria', 'Nalini', 'Mei', 'Qi', 'Aya', 'Noor', 'Laila', 'Kei'],
  },
  Greece: {
    male: ['Nikos', 'Giorgos', 'Yannis', 'Kostas', 'Dimitris', 'Vasilis', 'Manolis', 'Petros', 'Christos', 'Panos', 'Spiros', 'Lefteris'],
    female: ['Lydia', 'Eleni', 'Maria', 'Katerina', 'Sofia', 'Dimitra', 'Ioanna', 'Vasiliki', 'Niki', 'Foteini', 'Athena', 'Irene'],
  },
  Spain: {
    male: ['Alejandro', 'Javier', 'Carlos', 'Diego', 'Miguel', 'Sergio', 'Luis'],
    female: ['Lucia', 'Carmen', 'Sofia', 'Alba', 'Ines', 'Noelia', 'Vera'],
  },
  Italy: {
    male: ['Luca', 'Marco', 'Matteo', 'Stefano', 'Alessio', 'Riccardo', 'Fabio'],
    female: ['Giulia', 'Alessia', 'Martina', 'Chiara', 'Elisa', 'Valentina', 'Serena'],
  },
  France: {
    male: ['Julien', 'Alexandre', 'Nicolas', 'Antoine', 'Mathieu', 'Remy'],
    female: ['Camille', 'Chloe', 'Lea', 'Elodie', 'Sabine', 'Adele'],
  },
  Germany: {
    male: ['Lukas', 'Felix', 'Jonas', 'Leon', 'Moritz', 'Tobias'],
    female: ['Anna', 'Lena', 'Emma', 'Mia', 'Greta', 'Lotte'],
  },
  Netherlands: {
    male: ['Daan', 'Lars', 'Bram', 'Milan', 'Joost'],
    female: ['Eva', 'Sophie', 'Mila', 'Noor', 'Isla'],
  },
  Sweden: {
    male: ['Erik', 'Johan', 'Henrik', 'Oskar', 'Nils'],
    female: ['Linnea', 'Freja', 'Astrid', 'Saga', 'Elin'],
  },
  Portugal: {
    male: ['Tiago', 'Miguel', 'Joao', 'Rui', 'Andre'],
    female: ['Ines', 'Beatriz', 'Mariana', 'Carlota', 'Filipa'],
  },
  Poland: {
    male: ['Piotr', 'Tomasz', 'Adam', 'Krzysztof', 'Mateusz'],
    female: ['Anna', 'Marta', 'Zofia', 'Magda', 'Oliwia'],
  },
  'Czech Republic': {
    male: ['Jan', 'Tomas', 'Pavel', 'Jakub', 'Radek'],
    female: ['Petra', 'Jana', 'Eva', 'Lucie', 'Karolina'],
  },
  Philippines: {
    male: ['Arvin', 'Carlo', 'Jericho', 'Paolo', 'Renzo', 'Jomar', 'Ramon', 'Angelo', 'Ethan', 'Dominic', 'Miguel', 'Noel', 'Benedict'],
    female: ['Katrina', 'Lia', 'Mika', 'Hazel', 'Bea', 'Trisha', 'Alona', 'Celine', 'Giana', 'Ysabel', 'Clarise', 'Rhia', 'Monique'],
  },
  Thailand: {
    male: ['Narin', 'Kiet', 'Than', 'Arun', 'Pravit', 'Sunti'],
    female: ['Mali', 'Anong', 'Dara', 'Kanya', 'Sopa', 'Lamai'],
  },
  Singapore: {
    male: ['Wei Liang', 'Jun Hao', 'Desmond', 'Kai', 'Ethan'],
    female: ['Li Wen', 'Mei Lin', 'Jia Hui', 'Serene', 'Xiu'],
  },
  Malaysia: {
    male: ['Hafiz', 'Amir', 'Farid', 'Irfan', 'Nazim'],
    female: ['Aisha', 'Nur', 'Liyana', 'Farah', 'Syifa'],
  },
};

const coupleNicknames = [
  'AmberConstellation',
  'RecklessHarmony',
  'SatinAfterglow',
  'MidnightPatchouli',
  'HoneyedMirage',
  'VelvetTyphoon',
  'TenderEclipse',
  'CrimsonSonata',
  'IvoryPulse',
  'GossamerHeat',
  'WildflowerRush',
  'MoonlitAlchemy',
  'IndigoSparks',
  'OpalReckoning',
  'AromaticRiddle',
  'SilkenAvalanche',
  'NocturneBloom',
  'SableAvalon',
  'EmberAnthem',
  'WildcardMuse',
  'DaringLullaby',
  'SilverCrescendo',
  'CrushedVelvetia',
  'AmberSmoke',
  'PorcelainWhisper',
  'TwilightVow',
  'VermilionArc',
  'InkedPromise',
  'RogueBoudoir',
  'TidalSerenade',
  'MagneticWhim',
  'LuxeReverie',
  'ScarletCompass',
  'EbonRhapsody',
  'DuskyCatalyst',
  'GildedMyth',
  'FerventPalette',
  'SablePanorama',
  'TenderVolt',
  'RougeEcho',
  'JasmineCipher',
  'TemperedWildfire',
  'SavageSolstice',
  'OpalineFlare',
  'AstralRebellion',
  'BoldEthereal',
  'SmokyCarousel',
  'VelourPhantom',
  'AmberHurricane',
  'CharmedRefrain',
  'NeonDelirium',
  'ErosCascade',
  'WildMagnolia',
  'PoisedTempest',
  'FableEmbrace',
  'SwayingHalcyon',
  'SecretPulse',
  'LiminalTremor',
  'UntamedCadence',
  'AuroraQuiver',
];

const INTEREST_OPTIONS = ['Full Swap', 'Soft Swap', 'Same room', 'Cuckold'];

const bioTemplates = [
  'Curated duo blending classy evenings with a daring twist. Prefers private lounges and boutique hotels.',
  'Minimalist hedonists chasing gourmet tastings, rooftop pools, and playful after-hours.',
  'Sensual storytellers with a love for jazz bars, candlelight, and whispered plans.',
  'Art-forward duo who collects experiences, from gallery nights to hidden speakeasies.',
  'Magnetic pair urging sophisticated dates, slow dances, and decadent desserts.',
  'Soft-power adventurers craving weekend escapes, silk sheets, and sunrise bubbles.',
  'Velvet energy with a focus on chemistry checks, curated playlists, and scented candles.',
  'Low-profile thrill seekers who adore custom cocktails, city lights, and secret passwords.',
  'Tempered fire balancing gym rituals with indulgent spas and midnight rendezvous.',
  'Champagne-driven romantics eager for tasteful mischief, laughter, and tactile charm.',
];

const welcomeTemplates = [
  'Slide in with a smart intro and we will orchestrate the rest.',
  'Lead with wit, respect, and your favorite rooftop hideaway.',
  'Enchant us with a plan dripping in ambiance and discretion.',
  'Bring your signature scent; we will bring the curated playlist.',
  'Curious minds with confident energy get the first meeting.',
  'We respond to intentional invitations layered with style.',
  'Set the tone, set the date, and we luxuriate in the details.',
  'We thrive on elegant mischief - surprise us.',
  'Tempt us with a setting worth dressing up for.',
  "Leave the ordinary at the door and let's sculpt a night.",
];

const coupleTypeOverrides = new Map([
  [5, 'ff'],
  [12, 'ff'],
  [24, 'ff'],
  [33, 'ff'],
  [42, 'ff'],
  [48, 'ff'],
  [9, 'mm'],
  [17, 'mm'],
  [29, 'mm'],
  [38, 'mm'],
  [47, 'mm'],
  [55, 'mm'],
]);

const nameIndexState = {};

const pseudoRandom = (seed) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

const pad = (value) => String(value).padStart(2, '0');

const formatDate = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;

const takeName = (country, segment, gender) => {
  const poolKey = namePools[country] ? country : segment.startsWith('asia') ? 'defaultAsia' : 'defaultEurope';
  const pool = namePools[poolKey][gender];
  if (!pool || pool.length === 0) {
    throw new Error(`Missing ${gender} names for ${country} (pool key ${poolKey})`);
  }
  const cacheKey = `${poolKey}_${gender}`;
  const idx = nameIndexState[cacheKey] || 0;
  nameIndexState[cacheKey] = (idx + 1) % pool.length;
  return pool[idx % pool.length];
};

const assignPartnerNames = (country, segment, coupleType) => {
  if (coupleType === 'ff') {
    const first = takeName(country, segment, 'female');
    const second = takeName(country, segment, 'female');
    return { partner1: first, partner2: second };
  }
  if (coupleType === 'mm') {
    const first = takeName(country, segment, 'male');
    const second = takeName(country, segment, 'male');
    return { partner1: first, partner2: second };
  }
  const male = takeName(country, segment, 'male');
  const female = takeName(country, segment, 'female');
  return { partner1: male, partner2: female };
};

const escapeSql = (value) => value.replace(/'/g, "''");

const pickBetween = (start, end, seed) => {
  const window = end.getTime() - start.getTime();
  const offset = Math.floor(window * seed);
  return new Date(start.getTime() + offset);
};

const sampleInterests = (seedBase) => {
  const decorated = INTEREST_OPTIONS.map((option, index) => ({
    option,
    sortKey: pseudoRandom(seedBase * (index + 1.37)),
  }));
  decorated.sort((a, b) => a.sortKey - b.sortKey);
  const desiredCount = Math.max(
    1,
    Math.min(
      INTEREST_OPTIONS.length,
      Math.ceil(pseudoRandom(seedBase * 0.61) * INTEREST_OPTIONS.length),
    ),
  );
  return decorated.slice(0, desiredCount).map((item) => item.option);
};

const entries = [];
let nicknameIndex = 0;
let membershipIndex = 0;

for (const config of countryConfigs) {
  for (let i = 0; i < config.count; i += 1) {
    if (nicknameIndex >= coupleNicknames.length) {
      throw new Error('Configured more couples than nicknames.');
    }

    const nickname = coupleNicknames[nicknameIndex];
    const emailSlug = nickname.toLowerCase().replace(/[^a-z0-9]/g, '');
    const email = `${emailSlug}@${EMAIL_DOMAIN}`;
    const partnerEmail = `${emailSlug}.partner@${EMAIL_DOMAIN}`;
    const membershipType = membershipIndex < 45 ? 'platinum' : 'trial';
    const coupleType = coupleTypeOverrides.get(membershipIndex) || 'mf';
    const { partner1, partner2 } = assignPartnerNames(config.country, config.segment, coupleType);
    const coupleLabel =
      coupleType === 'mf' ? `${partner1} & ${partner2}` : `${partner2} & ${partner1}`;
    const city = config.cities[i % config.cities.length];
    const bio = bioTemplates[membershipIndex % bioTemplates.length];
    const welcomeMessage = welcomeTemplates[membershipIndex % welcomeTemplates.length];

    const baseSeed = membershipIndex + 1;
    const subscribeSeed = pseudoRandom(baseSeed * 1.73);
    const expirySeed = pseudoRandom(baseSeed * 2.41);
    const interestsCsv = sampleInterests(baseSeed * 3.09 + subscribeSeed).join(', ');

    const platinumStart = new Date(Date.UTC(2025, 3, 1, 18, 30, 0));
    const platinumEnd = new Date(Date.UTC(2025, 8, 25, 22, 15, 0));
    const trialStart = new Date(Date.UTC(2025, 9, 5, 19, 0, 0));
    const trialEnd = new Date(Date.UTC(2025, 10, 25, 23, 45, 0));

    const subscribedAt =
      membershipType === 'platinum'
        ? pickBetween(platinumStart, platinumEnd, subscribeSeed)
        : pickBetween(trialStart, trialEnd, subscribeSeed);

    const expiryDate = new Date(subscribedAt.getTime());
    if (membershipType === 'platinum') {
      expiryDate.setDate(expiryDate.getDate() + 40 + Math.round(expirySeed * 30));
    } else {
      expiryDate.setDate(expiryDate.getDate() + 12 + Math.round(expirySeed * 6));
    }

    entries.push({
      email,
      partnerEmail,
      username: nickname,
      partner1Nickname: partner1,
      partner2Nickname: partner2,
      coupleLabel,
      country: config.country,
      city,
      membershipType,
      membershipExpiryDate: formatDate(expiryDate),
      subscribedAt: formatDate(subscribedAt),
      welcomeMessage,
      bio,
      coupleType,
      segment: config.segment,
      notes: 'Seeded fake couple profile for admin dashboard control.',
      isActive: 1,
      interestsCsv,
    });

    nicknameIndex += 1;
    membershipIndex += 1;
  }
}

if (entries.length !== coupleNicknames.length) {
  throw new Error(`Generated ${entries.length} entries but expected ${coupleNicknames.length}.`);
}

const valuesSql = entries
  .map(
    (entry) =>
      `  ('${escapeSql(entry.email)}', '${escapeSql(entry.partnerEmail)}', '${escapeSql(
        entry.username,
      )}', '${escapeSql(entry.partner1Nickname)}', '${escapeSql(
        entry.partner2Nickname,
      )}', '${escapeSql(entry.coupleLabel)}', '${escapeSql(entry.country)}', '${escapeSql(
        entry.city,
      )}', '${entry.membershipType}', '${entry.membershipExpiryDate}', '${entry.subscribedAt}', '${escapeSql(
        entry.welcomeMessage,
      )}', '${escapeSql(entry.bio)}', '${entry.coupleType}', '${escapeSql(entry.segment)}', '${escapeSql(
        entry.notes,
      )}', '${escapeSql(entry.interestsCsv)}', ${entry.isActive ? 1 : 0})`,
  )
  .join(',\n');

const sql = `/* 2025-10-31: Seed 60 curated fake couples for admin tooling */
SET XACT_ABORT ON;

DECLARE @PasswordHash NVARCHAR(200) = '${PASSWORD_HASH}';
DECLARE @SeedData TABLE (
  Email NVARCHAR(320) NOT NULL,
  PartnerEmail NVARCHAR(320) NULL,
  Username NVARCHAR(100) NOT NULL,
  Partner1Nickname NVARCHAR(100) NOT NULL,
  Partner2Nickname NVARCHAR(100) NOT NULL,
  CoupleLabel NVARCHAR(150) NOT NULL,
  Country NVARCHAR(100) NOT NULL,
  City NVARCHAR(100) NOT NULL,
  MembershipType NVARCHAR(30) NOT NULL,
  MembershipExpiryDate DATETIME2(7) NOT NULL,
  SubscribedAt DATETIME2(7) NOT NULL,
  WelcomeMessage NVARCHAR(250) NOT NULL,
  Bio NVARCHAR(MAX) NOT NULL,
  CoupleType NVARCHAR(10) NOT NULL,
  Segment NVARCHAR(50) NOT NULL,
  Notes NVARCHAR(500) NULL,
  InterestsCsv NVARCHAR(200) NOT NULL,
  IsActive BIT NOT NULL
);

INSERT INTO @SeedData (
  Email, PartnerEmail, Username, Partner1Nickname, Partner2Nickname,
  CoupleLabel, Country, City, MembershipType, MembershipExpiryDate,
  SubscribedAt, WelcomeMessage, Bio, CoupleType, Segment, Notes, InterestsCsv, IsActive
) VALUES
${valuesSql}
;

DECLARE @Now DATETIME2(7) = SYSUTCDATETIME();
DECLARE @InsertedUsers INT = 0;
DECLARE @InsertedFakeUsers INT = 0;

DECLARE @NewUsers TABLE (
  Email NVARCHAR(320) NOT NULL,
  UserID UNIQUEIDENTIFIER NOT NULL
);

INSERT INTO dbo.Users (
  UserID,
  Email,
  PasswordHash,
  Username,
  CreatedAt,
  UpdatedAt,
  PartnerEmail,
  CoupleType,
  Country,
  City,
  Partner1Nickname,
  Partner2Nickname,
  IsEmailVerified,
  IsPartnerEmailVerified,
  MembershipType,
  MembershipExpiryDate,
  SubscribedAt,
  WelcomeMessage,
  Bio,
  InterestsCsv
)
OUTPUT inserted.Email, inserted.UserID INTO @NewUsers (Email, UserID)
SELECT
  NEWID(),
  s.Email,
  @PasswordHash,
  s.Username,
  @Now,
  @Now,
  s.PartnerEmail,
  s.CoupleType,
  s.Country,
  s.City,
  s.Partner1Nickname,
  s.Partner2Nickname,
  1,
  CASE WHEN s.PartnerEmail IS NULL THEN 0 ELSE 1 END,
  s.MembershipType,
  s.MembershipExpiryDate,
  s.SubscribedAt,
  s.WelcomeMessage,
  s.Bio,
  s.InterestsCsv
FROM @SeedData s
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.Users u
  WHERE LOWER(u.Email) = LOWER(s.Email)
);

SET @InsertedUsers = @@ROWCOUNT;

INSERT INTO dbo.FakeUsers (
  UserID,
  CoupleLabel,
  MembershipPlan,
  IsActive,
  OriginCountry,
  OriginCity,
  Segment,
  Notes,
  CreatedBy,
  UpdatedBy
)
SELECT
  nu.UserID,
  s.CoupleLabel,
  s.MembershipType,
  s.IsActive,
  s.Country,
  s.City,
  s.Segment,
  s.Notes,
  'seed-script',
  'seed-script'
FROM @NewUsers nu
JOIN @SeedData s ON LOWER(s.Email) = LOWER(nu.Email)
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.FakeUsers f
  WHERE f.UserID = nu.UserID
);

SET @InsertedFakeUsers = @@ROWCOUNT;

PRINT CONCAT('Inserted fake couples into Users: ', @InsertedUsers);
PRINT CONCAT('Inserted rows into FakeUsers: ', @InsertedFakeUsers);
GO
`;

fs.writeFileSync(OUTPUT_FILE, sql, 'utf8');
console.log(`Generated seed script at ${OUTPUT_FILE}`);
