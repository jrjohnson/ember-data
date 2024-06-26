const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const root = process.cwd();

const pkgs = new Map();
const otherPkgs = new Set([]);
const files = new Map();
const currentVersion = require(path.join(root, 'package.json')).version;
const peer_exceptions = {
  '@ember-data/active-record': {
    '@ember-data/store': true,
  },
  '@ember-data/rest': {
    '@ember-data/store': true,
  },
};
const ignore_hardlinks = new Set(['@warp-drive/internal-config']);

function isPeerException(pkg, dep) {
  return Boolean(peer_exceptions[pkg] && peer_exceptions[pkg][dep]);
}

function getRequiredPeers(dep, version = '*', seen = new Map()) {
  const pkg = pkgs.get(dep);
  if (!pkg) {
    if (otherPkgs.has(dep)) {
      seen.set(dep, version);
    }

    // TODO - handle otherPkgs that aren't these
    return seen;
  }
  seen.set(dep, version);

  if (pkg.peerDependencies) {
    Object.entries(pkg.peerDependencies).forEach(([peer, version]) => {
      getRequiredPeers(peer, version, seen);
    });
  }

  return seen;
}

fs.readdirSync(path.join(root, 'packages')).forEach((dirName) => {
  const pkg = require(path.join(root, 'packages', dirName, 'package.json'));
  pkgs.set(pkg.name, pkg);
  files.set(pkg.name, {
    path: path.join(root, 'packages', dirName, 'package.json'),
    pkg,
  });
});

fs.readdirSync(path.join(root, 'tests')).forEach((dirName) => {
  const pkg = require(path.join(root, 'tests', dirName, 'package.json'));
  pkgs.set(pkg.name, pkg);
  files.set(pkg.name, {
    path: path.join(root, 'tests', dirName, 'package.json'),
    pkg,
  });
});

const configPkg = require(path.join(root, './config/package.json'));
pkgs.set(configPkg.name, configPkg);
files.set(configPkg.name, {
  path: path.join(root, './config/package.json'),
  configPkg,
});

pkgs.forEach((pkg) => {
  let edited = false;
  console.log(
    chalk.grey(`\tValidating ${pkg.private ? '(private) ' : ''}${chalk.yellow(pkg.name)}@${chalk.magenta(pkg.version)}`)
  );

  if (!pkg.scripts) {
    console.log(chalk.grey(`\t\t[FIX] Missing scripts`));
    edited = true;
    pkg.scripts = {};
  }
  // if (!pkg.scripts['_syncPnpm']) {
  //   console.log(`Missing _syncPnpm script for ${pkg.name}`);
  //   edited = true;
  //   pkg.scripts['_syncPnpm'] = 'bun run sync-dependencies-meta-injected';
  // }
  if (pkg.scripts['prepare']) {
    console.log(chalk.grey(`\t\t[FIX] Removing scripts.prepare`));
    edited = true;
    delete pkg.scripts['prepare'];
  }

  Object.entries(pkg.dependencies ?? {}).forEach(([dep, version]) => {
    if (pkgs.has(dep)) {
      const depVersion = pkgs.get(dep).version;
      const wsVersion = `workspace:${depVersion}`;

      if (version !== wsVersion) {
        console.log(`Dependency mismatch for ${pkg.name} -> ${dep} - expected ${wsVersion} but found ${version}`);
        edited = true;
        pkg.dependencies[dep] = wsVersion;
      }
    }

    if (pkgs.has(dep) || otherPkgs.has(dep)) {
      if (ignore_hardlinks.has(dep)) {
        if (pkg.dependenciesMeta?.[dep]?.injected) {
          console.log(`Removing hardlink for ${pkg.name}`);
          edited = true;
          if (Object.keys(pkg.dependenciesMeta[dep]).length === 1) {
            delete pkg.dependenciesMeta[dep];
          } else {
            delete pkg.dependenciesMeta[dep].injected;
          }
        }
        return;
      }
      if (!pkg.dependenciesMeta) {
        console.log(`Missing dependenciesMeta for ${pkg.name}`);
        edited = true;
        pkg.dependenciesMeta = {};
      }
      if (!pkg.dependenciesMeta[dep]) {
        console.log(`Missing dependenciesMeta for ${pkg.name} -> ${dep}`);
        edited = true;
        pkg.dependenciesMeta[dep] = {};
      }
      if (!pkg.dependenciesMeta[dep].injected) {
        console.log(`Missing injected: true in dependenciesMeta for ${pkg.name} -> ${dep}`);
        edited = true;
        pkg.dependenciesMeta[dep].injected = true;
      }
    }
  });

  Object.entries(pkg.peerDependencies ?? {}).forEach(([dep, version]) => {
    if (pkgs.has(dep)) {
      const depVersion = pkgs.get(dep).version;
      const wsVersion = `workspace:${depVersion}`;

      if (version !== wsVersion && !isPeerException(pkg.name, dep)) {
        console.log(`Peer Dependency mismatch for ${pkg.name} -> ${dep} - expected ${wsVersion} but found ${version}`);
        edited = true;
        pkg.peerDependencies[dep] = wsVersion;
      }

      const requiredPeers = getRequiredPeers(dep);
      requiredPeers.delete(dep);
      requiredPeers.forEach((version, peer) => {
        if (!pkg.devDependencies || !pkg.devDependencies[peer]) {
          console.log(`\tMissing transient peer dependency ${peer}@${version} for ${pkg.name} -> ${dep}`);
          edited = true;
          if (!pkg.devDependencies) {
            pkg.devDependencies = {};
          }
          pkg.devDependencies[peer] = pkgs.has(peer) ? `workspace:${pkgs.get(peer).version}` : version;
        }
      });
    }

    if (pkgs.has(dep) || otherPkgs.has(dep)) {
      if (ignore_hardlinks.has(dep)) {
        if (pkg.dependenciesMeta?.[dep]?.injected) {
          console.log(`Removing hardlink for ${pkg.name}`);
          edited = true;
          if (Object.keys(pkg.dependenciesMeta[dep]).length === 1) {
            delete pkg.dependenciesMeta[dep];
          } else {
            delete pkg.dependenciesMeta[dep].injected;
          }
        }
        return;
      }

      if (!pkg.devDependencies) {
        console.log(`Missing devDependencies for ${pkg.name}`);
        edited = true;
        pkg.devDependencies = {};
      }
      if (!pkg.devDependencies[dep]) {
        console.log(`Missing devDependencies for ${pkg.name} -> ${dep}`);
        edited = true;
        pkg.devDependencies[dep] = otherPkgs.has(dep) ? version : `workspace:${pkgs.get(dep).version}`;
      }
      if (!pkg.dependenciesMeta) {
        console.log(`Missing (dev) dependenciesMeta for ${pkg.name}`);
        edited = true;
        pkg.dependenciesMeta = {};
      }
      if (!pkg.dependenciesMeta[dep]) {
        console.log(`Missing (dev) dependenciesMeta for ${pkg.name} -> ${dep}`);
        edited = true;
        pkg.dependenciesMeta[dep] = {};
      }
      if (!pkg.dependenciesMeta[dep].injected) {
        console.log(`Missing injected: true in (dev) dependenciesMeta for ${pkg.name} -> ${dep}`);
        edited = true;
        pkg.dependenciesMeta[dep].injected = true;
      }
    }
  });

  const deps = Object.entries(pkg.devDependencies ?? {});

  for (let i = 0; i < deps.length; i++) {
    const [dep, version] = deps[i];

    if (pkgs.has(dep)) {
      const depVersion = pkgs.get(dep).version;
      const wsVersion = `workspace:${depVersion}`;

      if (version !== wsVersion && !isPeerException(pkg.name, dep)) {
        console.log(`Dev Dependency mismatch for ${pkg.name} -> ${dep} - expected ${wsVersion} but found ${version}`);
        edited = true;
        pkg.devDependencies[dep] = wsVersion;
      }

      const requiredPeers = getRequiredPeers(dep);
      requiredPeers.delete(dep);
      requiredPeers.forEach((version, peer) => {
        if (!pkg.devDependencies[peer]) {
          console.log(`\tMissing transient peer dependency ${peer}@${version} for ${pkg.name} -> ${dep}`);
          edited = true;
          if (!pkg.devDependencies) {
            pkg.devDependencies = {};
          }
          pkg.devDependencies[peer] = pkgs.has(peer) ? `workspace:${pkgs.get(peer).version}` : version;
          deps.push([peer, version]);
        }
      });
    }

    if (pkgs.has(dep) || otherPkgs.has(dep)) {
      if (ignore_hardlinks.has(dep)) {
        if (pkg.dependenciesMeta?.[dep]?.injected) {
          console.log(`Removing hardlink for ${pkg.name}`);
          edited = true;
          if (Object.keys(pkg.dependenciesMeta[dep]).length === 1) {
            delete pkg.dependenciesMeta[dep];
          } else {
            delete pkg.dependenciesMeta[dep].injected;
          }
        }
        continue;
      }

      if (!pkg.dependenciesMeta) {
        console.log(`Missing (dev) dependenciesMeta for ${pkg.name}`);
        edited = true;
        pkg.dependenciesMeta = {};
      }
      if (!pkg.dependenciesMeta[dep]) {
        console.log(`Missing (dev) dependenciesMeta for ${pkg.name} -> ${dep}`);
        edited = true;
        pkg.dependenciesMeta[dep] = {};
      }
      if (!pkg.dependenciesMeta[dep].injected) {
        console.log(`Missing injected: true in (dev) dependenciesMeta for ${pkg.name} -> ${dep}`);
        edited = true;
        pkg.dependenciesMeta[dep].injected = true;
      }
    }
  }

  if (pkg.devDependenciesMeta) {
    console.log(`Merging devDependenciesMeta into dependenciesMeta for ${pkg.name}`);
    edited = true;
    pkg.dependenciesMeta = pkg.dependenciesMeta ?? {};
    Object.assign(pkg.dependenciesMeta, pkg.devDependenciesMeta);
    delete pkg.devDependenciesMeta;
  }

  if (edited) {
    fs.writeFileSync(files.get(pkg.name).path, JSON.stringify(pkg, null, 2) + '\n');
  }
});
