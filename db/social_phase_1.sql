IF OBJECT_ID('dbo.UserProfiles', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.UserProfiles (
    UserId INT NOT NULL PRIMARY KEY,
    DisplayName NVARCHAR(120) NULL,
    Bio NVARCHAR(600) NULL,
    AvatarUrl NVARCHAR(500) NULL,
    FavoriteGenres NVARCHAR(250) NULL,
    FavoriteBook NVARCHAR(250) NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_UserProfiles_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_UserProfiles_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_UserProfiles_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId)
  );
END;

IF OBJECT_ID('dbo.UserGoals', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.UserGoals (
    UserId INT NOT NULL PRIMARY KEY,
    WeeklyReadingDaysGoal INT NOT NULL CONSTRAINT DF_UserGoals_WeeklyDays DEFAULT 4,
    MonthlyBooksGoal INT NOT NULL CONSTRAINT DF_UserGoals_MonthlyBooks DEFAULT 2,
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_UserGoals_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_UserGoals_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId)
  );
END;

IF OBJECT_ID('dbo.UserFollows', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.UserFollows (
    FollowerUserId INT NOT NULL,
    FollowedUserId INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_UserFollows_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_UserFollows PRIMARY KEY (FollowerUserId, FollowedUserId),
    CONSTRAINT FK_UserFollows_Follower FOREIGN KEY (FollowerUserId) REFERENCES dbo.Users(UserId),
    CONSTRAINT FK_UserFollows_Followed FOREIGN KEY (FollowedUserId) REFERENCES dbo.Users(UserId),
    CONSTRAINT CHK_UserFollows_NoSelfFollow CHECK (FollowerUserId <> FollowedUserId)
  );
END;

IF OBJECT_ID('dbo.UserMyList', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.UserMyList (
    UserId INT NOT NULL,
    BookId NVARCHAR(255) NOT NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_UserMyList_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_UserMyList PRIMARY KEY (UserId, BookId),
    CONSTRAINT FK_UserMyList_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId)
  );
END;

IF OBJECT_ID('dbo.BookReviews', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.BookReviews (
    ReviewId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    UserId INT NOT NULL,
    BookId NVARCHAR(255) NOT NULL,
    Rating INT NOT NULL,
    Comment NVARCHAR(1500) NULL,
    HelpfulCount INT NOT NULL CONSTRAINT DF_BookReviews_HelpfulCount DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_BookReviews_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_BookReviews_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_BookReviews_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId),
    CONSTRAINT CHK_BookReviews_Rating CHECK (Rating BETWEEN 1 AND 5),
    CONSTRAINT UQ_BookReviews_UserBook UNIQUE (UserId, BookId)
  );
END;

IF OBJECT_ID('dbo.ReviewHelpfulVotes', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ReviewHelpfulVotes (
    ReviewId INT NOT NULL,
    UserId INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReviewHelpfulVotes_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_ReviewHelpfulVotes PRIMARY KEY (ReviewId, UserId),
    CONSTRAINT FK_ReviewHelpfulVotes_Review FOREIGN KEY (ReviewId) REFERENCES dbo.BookReviews(ReviewId),
    CONSTRAINT FK_ReviewHelpfulVotes_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId)
  );
END;

IF OBJECT_ID('dbo.UserActivity', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.UserActivity (
    ActivityId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    UserId INT NOT NULL,
    ActivityType NVARCHAR(50) NOT NULL,
    BookId NVARCHAR(255) NULL,
    ReviewId INT NULL,
    MetadataJson NVARCHAR(MAX) NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_UserActivity_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_UserActivity_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_UserActivity_UserId_CreatedAt' AND object_id = OBJECT_ID('dbo.UserActivity'))
BEGIN
  CREATE INDEX IX_UserActivity_UserId_CreatedAt
    ON dbo.UserActivity(UserId, CreatedAt DESC);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BookReviews_BookId' AND object_id = OBJECT_ID('dbo.BookReviews'))
BEGIN
  CREATE INDEX IX_BookReviews_BookId
    ON dbo.BookReviews(BookId, CreatedAt DESC);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_UserMyList_UserId_CreatedAt' AND object_id = OBJECT_ID('dbo.UserMyList'))
BEGIN
  CREATE INDEX IX_UserMyList_UserId_CreatedAt
    ON dbo.UserMyList(UserId, CreatedAt DESC);
END;
