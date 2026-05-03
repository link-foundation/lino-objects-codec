export function parseCratesVersionResponse({ status, body }) {
  if (status === 404) {
    return false;
  }

  if (status !== 200) {
    throw new Error(
      `crates.io version probe returned HTTP ${status}; refusing to guess release state`
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error(
      `crates.io version probe returned invalid JSON: ${error.message}`
    );
  }

  if (!parsed || !parsed.version || typeof parsed.version !== 'object') {
    throw new Error('crates.io version probe did not include a version object');
  }

  return true;
}

export function decideRustRelease({ hasFragments, currentVersionPublished }) {
  if (hasFragments) {
    return {
      shouldRelease: true,
      skipBump: false,
      reason: 'changelog fragments found',
    };
  }

  if (currentVersionPublished) {
    return {
      shouldRelease: false,
      skipBump: false,
      reason: 'current Cargo.toml version already exists on crates.io',
    };
  }

  return {
    shouldRelease: true,
    skipBump: true,
    reason: 'current Cargo.toml version is missing from crates.io',
  };
}

export function isAlreadyExistingReleaseError(output) {
  const lowerOutput = output.toLowerCase();
  return (
    lowerOutput.includes('already_exists') ||
    lowerOutput.includes('already exists') ||
    lowerOutput.includes('validation failed')
  );
}
