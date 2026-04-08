IF COL_LENGTH('dbo.UserProfiles', 'SelectedTitle') IS NULL
BEGIN
  ALTER TABLE dbo.UserProfiles
  ADD SelectedTitle NVARCHAR(80) NULL;
END;
