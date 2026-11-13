# Step 9: the production image of the sensor API.
#
# Built from the repository root (see docker-compose.yml), because it needs both api/ and data/.
# The data goes INSIDE the image: whoever runs this image gets exactly the same 30 days.

FROM python:3.15-slim

WORKDIR /srv

# 1. Dependencies first. Docker caches every step: as long as requirements.txt doesn't change,
#    a rebuild skips this (slow) step, even when you change the code.
COPY api/requirements.txt api/
RUN pip install --no-cache-dir -r api/requirements.txt

# 2. Then the data and the code.
COPY data/ data/
COPY api/ api/

# 3. Don't run as root: if someone breaks into the API, they can't change the container.
RUN useradd --create-home twin
USER twin

EXPOSE 8000

# 4. How Docker knows the API is healthy (not just started): ask /health every 10 s.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=2)"

CMD ["python", "api/main.py"]
