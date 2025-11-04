import { getPool, sql } from '../config/db';

const ROTATION_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const ONLINE_RATIO = 0.5;
const logPrefix = '[fakePresenceRotation]';

const shuffle = <T>(input: T[]): T[] => {
  const array = [...input];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

export async function rotateFakePresence(): Promise<void> {
  const pool = await getPool();

  const result = await pool
    .request()
    .query<{ UserID: string }>(`
      SELECT CAST(f.UserID AS NVARCHAR(255)) AS UserID
      FROM dbo.FakeUsers f
      JOIN dbo.Users u ON u.UserID = f.UserID
      WHERE ISNULL(f.IsActive, 0) = 1
    `);

  const fakeUserIds = result.recordset?.map((row) => String(row.UserID).trim()).filter(Boolean) ?? [];

  if (fakeUserIds.length === 0) {
    console.warn(`${logPrefix} No fake users found for presence rotation.`);
    return;
  }

  const shuffled = shuffle(fakeUserIds);
  const onlineCount = Math.max(1, Math.round(shuffled.length * ONLINE_RATIO));
  const onlineSet = new Set(shuffled.slice(0, onlineCount));

  const rotationRequest = pool.request();
  const values: string[] = [];

  fakeUserIds.forEach((userId, index) => {
    const paramUserId = `userId${index}`;
    const paramOnline = `isOnline${index}`;
    rotationRequest.input(paramUserId, sql.NVarChar(255), userId);
    rotationRequest.input(paramOnline, sql.Bit, onlineSet.has(userId) ? 1 : 0);
    values.push(`(@${paramUserId}, @${paramOnline})`);
  });

  const valuesClause = values.join(', ');

  await rotationRequest.query(`
    DECLARE @Presence TABLE (UserID NVARCHAR(255), ShouldBeOnline BIT);
    INSERT INTO @Presence (UserID, ShouldBeOnline)
    VALUES ${valuesClause};

    UPDATE u
      SET IsOnline = p.ShouldBeOnline
    FROM dbo.Users u
    INNER JOIN @Presence p
      ON u.UserID = TRY_CONVERT(UNIQUEIDENTIFIER, p.UserID);
  `);

  console.log(`${logPrefix} Rotated presence for ${fakeUserIds.length} fake users. Online count: ${onlineSet.size}.`);
}

export function scheduleFakePresenceRotation(): void {
  const executeJob = () => rotateFakePresence().catch((error) => console.error(`${logPrefix} Job failed:`, error));

  executeJob();
  setInterval(executeJob, ROTATION_INTERVAL_MS);
}
