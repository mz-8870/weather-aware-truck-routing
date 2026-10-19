from django.urls import path

from config.views import health, plan

urlpatterns = [path("api/health", health), path("api/plan", plan)]
