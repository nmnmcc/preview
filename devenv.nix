{
  pkgs,
  ...
}:

{
  packages = [ pkgs.git ];

  languages.javascript = {
    enable = true;
    package = pkgs.nodejs-slim_26;
    yarn.enable = true;
    yarn.install.enable = true;
  };
}
