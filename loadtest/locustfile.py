"""Step 9 (optional): what happens when many people open the flood map at once?

Each simulated user behaves like the app in your browser:
  - opens the page and loads the sensor sites, once
  - asks for the latest readings every 10 seconds (step 4)
  - now and then clicks a sensor and opens its Month tab (step 6)

Start it with:  docker compose --profile loadtest up
Then open port 8089, choose a number of users and a ramp-up rate, and press Start.
"""
import random

from locust import HttpUser, constant, task

SITES = [f"TBM-{i:02d}" for i in range(1, 34)]


class Resident(HttpUser):
    """Someone with the flood map open."""

    wait_time = constant(10)  # the app polls every 10 s

    def on_start(self):
        self.client.get("/", name="page")
        self.client.get("/api/sites")

    @task(10)
    def poll_live(self):
        self.client.get("/api/live")

    @task(1)
    def open_month_chart(self):
        site = random.choice(SITES)
        # `name` groups all 33 sensors under one line in Locust's statistics.
        self.client.get(f"/api/history/{site}/hourly", name="/api/history/[site]/hourly")
