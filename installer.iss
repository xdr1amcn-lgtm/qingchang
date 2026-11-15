#define MyAppName "轻场"
#define MyAppVersion "0.14.0"
#define MyAppPublisher "凡梦大王"
#define MyAppExeName "轻场.exe"

[Setup]
AppId={{5e471338-4d62-46b5-8ee5-8e74951401ad}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
VersionInfoVersion=0.14.0.0
VersionInfoCompany={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\轻场
DefaultGroupName=轻场
DisableProgramGroupPage=yes
DisableReadyPage=yes
DisableWelcomePage=yes
DisableDirPage=no
PrivilegesRequired=lowest
OutputDir=release-inno
OutputBaseFilename=轻场-0.14.0-安装包
SetupIconFile=assets\qingchang.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName=轻场
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardSmallImageFile=build\installerSmall.bmp
WizardSizePercent=100
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
CloseApplications=no
ChangesAssociations=no
SetupLogging=no
ShowLanguageDialog=no
LanguageDetectionMethod=locale

[Languages]
Name: "chinesesimplified"; MessagesFile: "build\ChineseSimplified.isl"

[Files]
Source: "release\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\轻场"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\轻场"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"

[Code]
var
  WelcomePage: TWizardPage;
  FinishedPage: TWizardPage;
  Footer: TPanel;
  ActionPanel: TPanel;
  ActionText: TNewStaticText;
  CancelText: TNewStaticText;
  BackText: TNewStaticText;
  ProgressTrack: TPanel;
  ProgressFill: TPanel;
  OnFinishedPage: Boolean;

procedure AddBrand(Page: TWizardPage; const HeadingText, Line1Text, Line2Text: String);
var
  Heading, Version, Line1, Line2, Follow: TNewStaticText;
begin
  Heading := TNewStaticText.Create(Page);
  Heading.Parent := Page.Surface;
  Heading.Left := ScaleX(64);
  Heading.Top := ScaleY(10);
  Heading.Caption := HeadingText;
  Heading.AutoSize := True;
  Heading.Font.Name := 'Microsoft YaHei UI';
  Heading.Font.Size := 22;
  Heading.Font.Style := [fsBold];
  Heading.Font.Color := $382A20;

  Version := TNewStaticText.Create(Page);
  Version.Parent := Page.Surface;
  Version.Left := ScaleX(64);
  Version.Top := ScaleY(56);
  Version.Caption := '版本 0.14.0 · Windows x64';
  Version.AutoSize := True;
  Version.Font.Name := 'Microsoft YaHei UI';
  Version.Font.Size := 10;
  Version.Font.Color := $8B7463;

  Line1 := TNewStaticText.Create(Page);
  Line1.Parent := Page.Surface;
  Line1.Left := ScaleX(64);
  Line1.Top := ScaleY(84);
  Line1.Caption := Line1Text;
  Line1.AutoSize := True;
  Line1.Font.Name := 'Microsoft YaHei UI';
  Line1.Font.Size := 10;
  Line1.Font.Color := $7A6A5B;

  Line2 := TNewStaticText.Create(Page);
  Line2.Parent := Page.Surface;
  Line2.Left := ScaleX(64);
  Line2.Top := ScaleY(106);
  Line2.Caption := Line2Text;
  Line2.AutoSize := True;
  Line2.Font.Name := 'Microsoft YaHei UI';
  Line2.Font.Size := 10;
  Line2.Font.Color := $7A6A5B;

  Follow := TNewStaticText.Create(Page);
  Follow.Parent := Page.Surface;
  Follow.Left := ScaleX(64);
  Follow.Top := ScaleY(136);
  Follow.Caption := '我的抖音：凡梦大王 · 欢迎关注';
  Follow.AutoSize := True;
  Follow.Font.Name := 'Microsoft YaHei UI';
  Follow.Font.Size := 10;
  Follow.Font.Style := [fsBold];
  Follow.Font.Color := $EA5614;
end;

procedure NextClick(Sender: TObject);
var
  ErrorCode: Integer;
begin
  if OnFinishedPage then
    ShellExec('open', ExpandConstant('{app}\{#MyAppExeName}'), '', ExpandConstant('{app}'), SW_SHOWNORMAL, ewNoWait, ErrorCode);
  WizardForm.NextButton.OnClick(nil);
end;

procedure CancelClick(Sender: TObject);
begin
  WizardForm.CancelButton.OnClick(nil);
end;

procedure BackClick(Sender: TObject);
begin
  WizardForm.BackButton.OnClick(nil);
end;

procedure InitializeWizard;
var
  FooterLine: TPanel;
begin
  WizardForm.Color := clWhite;
  WizardForm.MainPanel.Color := clWhite;
  WizardForm.NextButton.Visible := False;
  WizardForm.BackButton.Visible := False;
  WizardForm.CancelButton.Visible := False;

  WizardForm.PageNameLabel.Font.Name := 'Microsoft YaHei UI';
  WizardForm.PageNameLabel.Font.Size := 14;
  WizardForm.PageNameLabel.Font.Style := [fsBold];
  WizardForm.PageNameLabel.Font.Color := $382A20;
  WizardForm.PageDescriptionLabel.Font.Name := 'Microsoft YaHei UI';
  WizardForm.PageDescriptionLabel.Font.Size := 9;
  WizardForm.PageDescriptionLabel.Font.Color := $7A6A5B;
  WizardForm.StatusLabel.Font.Name := 'Microsoft YaHei UI';
  WizardForm.StatusLabel.Font.Size := 9;
  WizardForm.StatusLabel.Font.Color := $7A6A5B;
  WizardForm.FilenameLabel.Font.Name := 'Microsoft YaHei UI';
  WizardForm.FilenameLabel.Font.Size := 9;
  WizardForm.FilenameLabel.Font.Color := $8B7463;

  WizardForm.PageNameLabel.Height := ScaleY(24);
  WizardForm.PageDescriptionLabel.Top := ScaleY(34);
  WizardForm.PageDescriptionLabel.Height := ScaleY(20);

  WizardForm.SelectDirPage.Color := clWhite;
  WizardForm.SelectDirLabel.Font.Name := 'Microsoft YaHei UI';
  WizardForm.SelectDirLabel.Font.Size := 10;
  WizardForm.SelectDirLabel.Font.Color := $382A20;
  WizardForm.DirEdit.Font.Name := 'Microsoft YaHei UI';
  WizardForm.DirEdit.Font.Size := 10;
  WizardForm.DirBrowseButton.Font.Name := 'Microsoft YaHei UI';
  WizardForm.DirBrowseButton.Font.Size := 9;
  WizardForm.DiskSpaceLabel.Font.Name := 'Microsoft YaHei UI';
  WizardForm.DiskSpaceLabel.Font.Size := 9;
  WizardForm.DiskSpaceLabel.Font.Color := $7A6A5B;
  WizardForm.DiskSpaceLabel.Anchors := [];
  WizardForm.DiskSpaceLabel.Top := ScaleY(192);

  WelcomePage := CreateCustomPage(wpWelcome, '', '');
  WelcomePage.Surface.Color := clWhite;
  AddBrand(WelcomePage, '安装轻场',
    '安装到当前用户目录，不需要管理员权限。',
    '原有账号、订单和设置会保留。');

  FinishedPage := CreateCustomPage(wpInstalling, '', '');
  FinishedPage.Surface.Color := clWhite;
  AddBrand(FinishedPage, '安装完成',
    '轻场已安装到您的电脑。',
    '原有账号、订单和设置均已保留。');

  WizardForm.ProgressGauge.Visible := False;
  ProgressTrack := TPanel.Create(WizardForm.InstallingPage);
  ProgressTrack.Parent := WizardForm.InstallingPage;
  ProgressTrack.Left := WizardForm.ProgressGauge.Left;
  ProgressTrack.Top := WizardForm.ProgressGauge.Top +
    ((WizardForm.ProgressGauge.Height - ScaleY(6)) div 2);
  ProgressTrack.Width := WizardForm.ProgressGauge.Width;
  ProgressTrack.Height := ScaleY(6);
  ProgressTrack.BevelOuter := bvNone;
  ProgressTrack.ParentBackground := False;
  ProgressTrack.Color := $EFEFEF;

  ProgressFill := TPanel.Create(ProgressTrack);
  ProgressFill.Parent := ProgressTrack;
  ProgressFill.Left := 0;
  ProgressFill.Top := 0;
  ProgressFill.Width := 0;
  ProgressFill.Height := ProgressTrack.Height;
  ProgressFill.BevelOuter := bvNone;
  ProgressFill.ParentBackground := False;
  ProgressFill.Color := $EA5614;

  Footer := TPanel.Create(WizardForm);
  Footer.Parent := WizardForm;
  Footer.Left := 0;
  Footer.Top := WizardForm.ClientHeight - ScaleY(66);
  Footer.Width := WizardForm.ClientWidth;
  Footer.Height := ScaleY(66);
  Footer.BevelOuter := bvNone;
  Footer.ParentBackground := False;
  Footer.Color := clWhite;

  FooterLine := TPanel.Create(Footer);
  FooterLine.Parent := Footer;
  FooterLine.Left := 0;
  FooterLine.Top := 0;
  FooterLine.Width := Footer.Width;
  FooterLine.Height := ScaleY(1);
  FooterLine.BevelOuter := bvNone;
  FooterLine.ParentBackground := False;
  FooterLine.Color := $E6E6E6;

  ActionPanel := TPanel.Create(Footer);
  ActionPanel.Parent := Footer;
  ActionPanel.Left := Footer.ClientWidth - ScaleX(132);
  ActionPanel.Top := ScaleY(14);
  ActionPanel.Width := ScaleX(100);
  ActionPanel.Height := ScaleY(36);
  ActionPanel.BevelOuter := bvNone;
  ActionPanel.ParentBackground := False;
  ActionPanel.Color := $EA5614;
  ActionPanel.OnClick := @NextClick;

  ActionText := TNewStaticText.Create(ActionPanel);
  ActionText.Parent := ActionPanel;
  ActionText.Left := 0;
  ActionText.Top := ScaleY(9);
  ActionText.Width := ActionPanel.Width;
  ActionText.AutoSize := False;
  ActionText.Alignment := taCenter;
  ActionText.Caption := '安装';
  ActionText.Font.Name := 'Microsoft YaHei UI';
  ActionText.Font.Size := 9;
  ActionText.Font.Style := [fsBold];
  ActionText.Font.Color := clWhite;
  ActionText.OnClick := @NextClick;

  CancelText := TNewStaticText.Create(Footer);
  CancelText.Parent := Footer;
  CancelText.Left := ActionPanel.Left - ScaleX(58);
  CancelText.Top := ScaleY(23);
  CancelText.Caption := '取消';
  CancelText.Font.Name := 'Microsoft YaHei UI';
  CancelText.Font.Size := 9;
  CancelText.Font.Color := $8B7A68;
  CancelText.OnClick := @CancelClick;

  BackText := TNewStaticText.Create(Footer);
  BackText.Parent := Footer;
  BackText.Left := CancelText.Left - ScaleX(58);
  BackText.Top := ScaleY(23);
  BackText.Caption := '上一步';
  BackText.Font.Name := 'Microsoft YaHei UI';
  BackText.Font.Size := 9;
  BackText.Font.Color := $8B7A68;
  BackText.OnClick := @BackClick;
  BackText.Visible := False;

  OnFinishedPage := False;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (PageID = wpWelcome) or (PageID = wpFinished);
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  OnFinishedPage := (CurPageID = FinishedPage.ID);
  if CurPageID = WelcomePage.ID then
  begin
    Footer.Visible := True;
    ActionPanel.Visible := True;
    CancelText.Visible := True;
    BackText.Visible := False;
    ActionText.Caption := '下一步';
  end
  else if CurPageID = wpSelectDir then
  begin
    Footer.Visible := True;
    ActionPanel.Visible := True;
    CancelText.Visible := True;
    BackText.Visible := True;
    ActionText.Caption := '安装';
  end
  else if CurPageID = wpInstalling then
  begin
    Footer.Visible := False;
    ActionPanel.Visible := False;
    CancelText.Visible := False;
    BackText.Visible := False;
    WizardForm.CancelButton.Visible := False;
    ProgressFill.Width := 0;
  end
  else if CurPageID = FinishedPage.ID then
  begin
    Footer.Visible := True;
    ActionPanel.Visible := True;
    CancelText.Visible := False;
    BackText.Visible := False;
    ActionText.Caption := '完成';
  end;
end;

procedure CurInstallProgressChanged(CurProgress, MaxProgress: Integer);
begin
  if Assigned(ProgressTrack) and (MaxProgress > 0) then
    ProgressFill.Width := (ProgressTrack.Width * CurProgress) div MaxProgress;
end;
