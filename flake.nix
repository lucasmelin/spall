{
  description = "JavaScript application with pnpm";

  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; config.allowUnfree = true; };

        pname = "spall";
        version = "0.0.1";
        src = builtins.path {
          path = ./.;
          name = "spall-source";
        };

        pnpmDeps = pkgs.fetchPnpmDeps {
          inherit pname version src;
          fetcherVersion = 4;
          hash = "sha256-elrMQGeeSbNJA5BiXqVQ1W9JrK+xlolf85U1fV1ZBAo=";
        };
      in {
        packages.default = pkgs.stdenv.mkDerivation {
          inherit pname version src pnpmDeps;

          nativeBuildInputs = [
            pkgs.nodejs
            pkgs.pnpm
            pkgs.pnpmConfigHook
            pkgs.makeWrapper
          ];

          buildPhase = ''
            runHook preBuild
            pnpm build
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p $out/lib/spall
            cp -r dist node_modules package.json $out/lib/spall/
            makeWrapper ${pkgs.nodejs}/bin/node $out/bin/spall \
              --add-flags "$out/lib/spall/dist/cli.js"
            runHook postInstall
          '';

          meta = {
            description = "Render Knap templates embedded in Markdown files without disturbing surrounding content.";
            platforms = pkgs.lib.platforms.all;
            mainProgram = "spall";
          };
        };

        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.nodejs
            pkgs.pnpm
            pkgs.typescript
            pkgs.typescript-language-server
          ];
        };
      }
    );
}