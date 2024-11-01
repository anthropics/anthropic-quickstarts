# Anthropic Balance Tracker

A utility for tracking Anthropic API credit balance, with both automated and manual tracking capabilities.

## Features

- Secure credential storage with encryption 
- Automated balance checking via Anthropic Console
- Manual balance entry support
- Historical balance tracking with export/import
- Streamlit-based UI
- Comprehensive test coverage (90%+)

## Installation

```bash
pip install -e .
```

## Usage

### Running Locally

```bash
streamlit run computer_use_demo/balance_tracker/balance_tracker_v3.py
```

### Running with Docker

Build the container:
```bash
docker build -f Dockerfile.balance-tracker -t anthropic-balance-tracker .
```

Run the container:
```bash
docker run -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -v $HOME/.anthropic:/data \
  -p 8501:8501 \
  anthropic-balance-tracker
```

Then open http://localhost:8501 in your browser.

## Development

### Running Tests

```bash
python -m pytest tests/balance_tracker
```

### Test Coverage

```bash 
python -m pytest --cov=computer_use_demo tests/balance_tracker
```

### File Structure

```
computer_use_demo/balance_tracker/
├── __init__.py
├── balance_tracker_v3.py    # Core tracking functionality
├── display_config.py        # Display settings
└── README.md               # This file

tests/balance_tracker/
├── __init__.py
├── conftest.py             # Test configuration
└── test_balance_tracker.py # Test suite
```

### Security

- Credentials are stored with encryption using Fernet
- Sensitive files use 0600 permissions
- No credentials are logged
- Local file storage only

## License

This project is internal to Betty's development team.