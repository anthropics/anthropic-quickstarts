from setuptools import setup, find_packages

setup(
    name="computer_use_demo",
    version="0.1",
    packages=find_packages(),
    install_requires=[
        'pytest>=8.3.3',
        'pytest-cov>=6.0.0',
        'pytest-asyncio>=0.24.0',
        'streamlit>=1.39.0',
        'httpx>=0.27.2',
        'beautifulsoup4>=4.12.3',
        'cryptography>=43.0.3'
    ],
    python_requires='>=3.11',
)