.PHONY: install install-core dev run test lint docker sample

PY ?= python3

install:            ## full install, including the local speech engine
	$(PY) -m pip install -r requirements.txt

install-core:       ## install without the speech engine (captions then need an .srt file)
	$(PY) -m pip install -r requirements-core.txt

dev:                ## install for development
	$(PY) -m pip install -r requirements.txt -r requirements-dev.txt

run:                ## start Eden and open it in your browser
	$(PY) -m eden

test:
	$(PY) -m pytest

lint:
	$(PY) -m ruff check .

docker:
	docker compose up --build

sample:             ## create a 12 s test clip with pauses at data/sample.mp4
	sh scripts/make_sample.sh
