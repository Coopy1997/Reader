IF OBJECT_ID('dbo.UserChallengeRewards', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.UserChallengeRewards (
    UserId INT NOT NULL,
    ChallengeCode NVARCHAR(80) NOT NULL,
    AwardedXp INT NOT NULL,
    AwardedAt DATETIME2 NOT NULL CONSTRAINT DF_UserChallengeRewards_AwardedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_UserChallengeRewards PRIMARY KEY (UserId, ChallengeCode),
    CONSTRAINT FK_UserChallengeRewards_User FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId)
  );
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_UserChallengeRewards_UserId'
    AND object_id = OBJECT_ID('dbo.UserChallengeRewards')
)
BEGIN
  CREATE INDEX IX_UserChallengeRewards_UserId
    ON dbo.UserChallengeRewards(UserId, AwardedAt DESC);
END;
