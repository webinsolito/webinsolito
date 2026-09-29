import sys
import os
import shutil
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

TEST_DATA = Path(tempfile.mkdtemp(prefix='autosalone_one_test_'))
os.environ['AUTOSALONE_DATA_DIR'] = str(TEST_DATA)


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(TEST_DATA, ignore_errors=True)
