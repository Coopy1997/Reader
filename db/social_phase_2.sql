IF COL_LENGTH('dbo.UserProfiles', 'AvatarImagePath') IS NULL
BEGIN
  ALTER TABLE dbo.UserProfiles
  ADD AvatarImagePath NVARCHAR(500) NULL;
END;

IF COL_LENGTH('dbo.UserProfiles', 'ExperiencePoints') IS NULL
BEGIN
  ALTER TABLE dbo.UserProfiles
  ADD ExperiencePoints INT NOT NULL
    CONSTRAINT DF_UserProfiles_ExperiencePoints DEFAULT 0;
END;

IF COL_LENGTH('dbo.UserProfiles', 'BonusLevels') IS NULL
BEGIN
  ALTER TABLE dbo.UserProfiles
  ADD BonusLevels INT NOT NULL
    CONSTRAINT DF_UserProfiles_BonusLevels DEFAULT 0;
END;

IF OBJECT_ID('dbo.UserBadgeAwards', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.UserBadgeAwards (
    UserId INT NOT NULL,
    BadgeCode NVARCHAR(80) NOT NULL,
    SourceType NVARCHAR(20) NOT NULL CONSTRAINT DF_UserBadgeAwards_SourceType DEFAULT 'manual',
    IsRevoked BIT NOT NULL CONSTRAINT DF_UserBadgeAwards_IsRevoked DEFAULT 0,
    AwardedByUserId INT NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_UserBadgeAwards_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_UserBadgeAwards PRIMARY KEY (UserId, BadgeCode),
    CONSTRAINT FK_UserBadgeAwards_User FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId),
    CONSTRAINT FK_UserBadgeAwards_Admin FOREIGN KEY (AwardedByUserId) REFERENCES dbo.Users(UserId)
  );
END;

IF COL_LENGTH('dbo.UserBadgeAwards', 'IsRevoked') IS NULL
BEGIN
  ALTER TABLE dbo.UserBadgeAwards
  ADD IsRevoked BIT NOT NULL
    CONSTRAINT DF_UserBadgeAwards_IsRevoked_Backfill DEFAULT 0;
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_UserBadgeAwards_UserId' AND object_id = OBJECT_ID('dbo.UserBadgeAwards'))
BEGIN
  CREATE INDEX IX_UserBadgeAwards_UserId
    ON dbo.UserBadgeAwards(UserId, CreatedAt DESC);
END;
