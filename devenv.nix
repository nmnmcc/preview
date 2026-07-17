{
  pkgs,
  ...
}:

let
  projectPlaywrightVersion =
    (builtins.fromJSON (builtins.readFile ./examples/react/package.json)).dependencies.playwright;
  playwright = pkgs.playwright-driver;
  playwrightBrowsers = playwright.browsers.override {
    withChromium = false;
    withChromiumHeadlessShell = true;
    withFirefox = false;
    withWebkit = false;
    withFfmpeg = false;
  };
in
{
  assertions = [
    {
      assertion = playwright.version == projectPlaywrightVersion;
      message = ''
        nixpkgs has Playwright ${playwright.version}, but this project uses
        Playwright ${projectPlaywrightVersion}. Update devenv.lock or the
        Playwright package before you enter the shell.
      '';
    }
  ];

  packages = [ pkgs.git ];

  env = {
    PLAYWRIGHT_BROWSERS_PATH = "${playwrightBrowsers}";
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
    UV_DEFAULT_INDEX = "https://pypi.org/simple";
  };

  languages.javascript = {
    enable = true;
    package = pkgs.nodejs-slim_26;
    yarn.enable = true;
    yarn.install.enable = true;
  };

  languages.python = {
    enable = true;
    package = pkgs.python314;
    lsp.enable = false;
    venv.enable = true;
    uv = {
      enable = true;
      package = pkgs.uv;
      sync = {
        enable = true;
        arguments = [ "--locked" ];
      };
    };
  };
}
