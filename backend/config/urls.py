from django.urls import path

from config.views import geocode, health, heatmap, plan

urlpatterns = [path("api/health", health), path("api/plan", plan), path("api/geocode", geocode), path("api/heatmap", heatmap)]
