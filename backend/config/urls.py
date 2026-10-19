from django.urls import path

from config.views import geocode, health, plan

urlpatterns = [path("api/health", health), path("api/plan", plan), path("api/geocode", geocode)]
