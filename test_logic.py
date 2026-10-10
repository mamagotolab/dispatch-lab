#!/usr/bin/env python3
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent
for args in (
    ["npm", "run", "typecheck"],
    ["npm", "test"],
    ["npm", "run", "build"],
    ["npm", "run", "test:e2e"],
):
    subprocess.run(args, cwd=root, check=True)
