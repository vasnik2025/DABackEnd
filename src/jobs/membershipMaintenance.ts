import sql from "mssql";
import { getPool } from "../config/db";
import { sendPlatinumExpiryReminderEmail } from "../utils/emailService";

const REMINDER_LEAD_DAYS = 5;
const SCHEDULE_INTERVAL_MS = 12 * 60 * 60 * 1000; // every 12 hours

interface MembershipRow {
  UserID: string;
  Email?: string | null;
  PartnerEmail?: string | null;
  MembershipExpiryDate?: Date | string | null;
}

const logPrefix = "[membershipMaintenance]";

export async function runMembershipMaintenance(): Promise<void> {
  const pool = await getPool();

  // Send reminders 5 days before expiry
  const reminderResult = await pool
    .request()
    .input("leadDays", sql.Int, REMINDER_LEAD_DAYS)
    .query<MembershipRow>(`
      SELECT UserID, Email, PartnerEmail, MembershipExpiryDate
      FROM Users
      WHERE MembershipExpiryDate IS NOT NULL
        AND LOWER(ISNULL(MembershipType, '')) = 'platinum'
        AND DATEDIFF(day, SYSUTCDATETIME(), MembershipExpiryDate) = @leadDays
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.FakeUsers f
          WHERE f.UserID = Users.UserID
        )
    `);

  for (const row of reminderResult.recordset ?? []) {
    const recipients = [row.Email, row.PartnerEmail]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim());

    if (!recipients.length) {
      continue;
    }

    const expiryValue = row.MembershipExpiryDate;
    const expiryDate =
      expiryValue instanceof Date
        ? expiryValue
        : expiryValue
        ? new Date(expiryValue)
        : null;

    try {
      await sendPlatinumExpiryReminderEmail(recipients, { membershipExpiryDate: expiryDate });
      console.log(`${logPrefix} Sent platinum expiry reminder for user ${row.UserID}.`);
    } catch (error) {
      console.error(`${logPrefix} Failed to send reminder for user ${row.UserID}:`, error);
    }
  }

  // Downgrade expired platinum memberships to free
  const downgradeCandidates = await pool.request().query<{ UserID: string }>(`
    SELECT CAST(UserID AS NVARCHAR(36)) AS UserID
    FROM Users
    WHERE MembershipExpiryDate IS NOT NULL
      AND LOWER(ISNULL(MembershipType, '')) = 'platinum'
      AND MembershipExpiryDate <= SYSUTCDATETIME()
      AND NOT EXISTS (
        SELECT 1
        FROM dbo.FakeUsers f
        WHERE f.UserID = Users.UserID
      );
  `);

  const idsToDowngrade = downgradeCandidates.recordset ?? [];
  if (idsToDowngrade.length) {
    const downgradeRequest = pool.request();
    const values: string[] = [];

    idsToDowngrade.forEach((row, index) => {
      const paramName = `userId${index}`;
      downgradeRequest.input(paramName, sql.NVarChar(50), row.UserID);
      values.push(`(@${paramName})`);
    });

    const valuesClause = values.join(", ");

    await downgradeRequest.query(`
      UPDATE Users
      SET MembershipType = 'free',
          MembershipExpiryDate = NULL,
          SubscribedAt = NULL
      WHERE UserID IN (
        SELECT TRY_CONVERT(UNIQUEIDENTIFIER, value)
        FROM (VALUES ${valuesClause}) AS v(value)
      );
    `);

    console.log(
      `${logPrefix} Downgraded platinum memberships to free for users: ${idsToDowngrade
        .map((row) => row.UserID)
        .join(", ")}`,
    );
  }
}

export function scheduleMembershipMaintenance(): void {
  const executeJob = () =>
    runMembershipMaintenance().catch((error) =>
      console.error(`${logPrefix} Job failed:`, error),
    );

  // Run immediately on startup
  executeJob();

  // Schedule periodic execution
  setInterval(executeJob, SCHEDULE_INTERVAL_MS);
}
