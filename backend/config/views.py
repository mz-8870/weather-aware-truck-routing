from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

import tomtom


@api_view(["GET"])
def health(request: Request) -> Response:
    return Response({"status": "ok"})


class TripSerializer(serializers.Serializer):
    origin = serializers.CharField(max_length=200)
    destination = serializers.CharField(max_length=200)
    departure = serializers.DateTimeField()
    weight_lb = serializers.FloatField(min_value=0)

    def validate_departure(self, value):
        if value < timezone.now():
            raise serializers.ValidationError("Departure must be in the future.")
        return value

    def validate(self, data):
        if data["origin"].strip().lower() == data["destination"].strip().lower():
            raise serializers.ValidationError({"destination": ["Destination must differ from origin."]})
        return data


@api_view(["POST"])
def plan(request: Request) -> Response:
    trip = TripSerializer(data=request.data)
    trip.is_valid(raise_exception=True)
    t = trip.validated_data
    try:
        with tomtom.http_client() as client:
            origin = tomtom.geocode(client, t["origin"])
            destination = tomtom.geocode(client, t["destination"])
            route = tomtom.truck_route(client, origin, destination, t["departure"], t["weight_lb"])
    except tomtom.NotFound as e:
        return Response({"detail": str(e)}, status=422)
    except tomtom.RoutingError:
        return Response({"detail": "Routing service unavailable. Try again."}, status=502)
    return Response({"routes": [route]})
