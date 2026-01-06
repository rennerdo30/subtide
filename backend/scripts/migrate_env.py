#!/usr/bin/env python3
"""
ENV Migration Script

Updates .env file with new variables from .env.example while preserving existing values.

Usage:
    python scripts/migrate_env.py
    python scripts/migrate_env.py --dry-run  # Preview changes without writing
"""

import os
import sys
import re
from pathlib import Path
from datetime import datetime


def parse_env_file(filepath: str) -> tuple[dict, list]:
    """
    Parse an env file into a dict of values and a list of lines (for structure).
    
    Returns:
        (values_dict, lines_list)
    """
    values = {}
    lines = []
    
    if not os.path.exists(filepath):
        return values, lines
    
    with open(filepath, 'r') as f:
        for line in f:
            lines.append(line.rstrip('\n'))
            
            # Skip empty lines and comments
            stripped = line.strip()
            if not stripped or stripped.startswith('#'):
                continue
            
            # Parse KEY=VALUE
            match = re.match(r'^([A-Z_][A-Z0-9_]*)=(.*)$', stripped)
            if match:
                key, value = match.groups()
                values[key] = value
    
    return values, lines


def migrate_env(example_path: str, env_path: str, dry_run: bool = False) -> tuple[list, list]:
    """
    Migrate .env to match .env.example structure while preserving values.
    
    Returns:
        (new_vars_added, vars_preserved)
    """
    # Parse both files
    example_values, example_lines = parse_env_file(example_path)
    current_values, _ = parse_env_file(env_path)
    
    if not example_lines:
        print(f"Error: {example_path} not found or empty")
        return [], []
    
    # Track changes
    new_vars = []
    preserved = []
    
    # Build new .env content using .env.example as template
    new_lines = []
    
    for line in example_lines:
        stripped = line.strip()
        
        # Handle commented-out variable examples (like # SERVER_MODEL=...)
        commented_match = re.match(r'^#\s*([A-Z_][A-Z0-9_]*)=(.*)$', stripped)
        if commented_match:
            key = commented_match.group(1)
            if key in current_values:
                # User has this value set - add as active (uncommented)
                new_lines.append(f"{key}={current_values[key]}")
                preserved.append(key)
                continue
        
        # Handle active variables
        active_match = re.match(r'^([A-Z_][A-Z0-9_]*)=(.*)$', stripped)
        if active_match:
            key, default_value = active_match.groups()
            if key in current_values:
                # Preserve existing value
                new_lines.append(f"{key}={current_values[key]}")
                preserved.append(key)
            else:
                # Use default from example
                new_lines.append(f"{key}={default_value}")
                new_vars.append(key)
            continue
        
        # Keep comments and blank lines as-is
        new_lines.append(line)
    
    # Add any variables from current .env that aren't in example
    extra_keys = set(current_values.keys()) - set(preserved)
    if extra_keys:
        new_lines.append("")
        new_lines.append("# =============================================================================")
        new_lines.append("# Custom Variables (not in .env.example)")
        new_lines.append("# =============================================================================")
        for key in sorted(extra_keys):
            new_lines.append(f"{key}={current_values[key]}")
    
    # Write or preview
    if dry_run:
        print("=" * 60)
        print("DRY RUN - Would write the following to .env:")
        print("=" * 60)
        for line in new_lines:
            print(line)
        print("=" * 60)
    else:
        # Backup existing .env
        if os.path.exists(env_path):
            backup_path = f"{env_path}.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            os.rename(env_path, backup_path)
            print(f"Backed up existing .env to {backup_path}")
        
        # Write new .env
        with open(env_path, 'w') as f:
            f.write('\n'.join(new_lines) + '\n')
        print(f"Updated {env_path}")
    
    return new_vars, preserved


def main():
    # Determine paths
    script_dir = Path(__file__).parent
    backend_dir = script_dir.parent
    
    example_path = backend_dir / '.env.example'
    env_path = backend_dir / '.env'
    
    # Check for --dry-run flag
    dry_run = '--dry-run' in sys.argv or '-n' in sys.argv
    
    print(f"ENV Migration Script")
    print(f"  Example: {example_path}")
    print(f"  Target:  {env_path}")
    print(f"  Mode:    {'DRY RUN' if dry_run else 'APPLY'}")
    print()
    
    new_vars, preserved = migrate_env(str(example_path), str(env_path), dry_run)
    
    print()
    print(f"Summary:")
    print(f"  Preserved: {len(preserved)} variables")
    print(f"  New:       {len(new_vars)} variables")
    
    if new_vars:
        print(f"\nNew variables added with defaults:")
        for var in new_vars:
            print(f"  - {var}")
    
    if not dry_run:
        print(f"\n✓ Migration complete!")
    else:
        print(f"\nRun without --dry-run to apply changes.")


if __name__ == '__main__':
    main()
