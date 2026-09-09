"use strict";

import { Animated as RNAnimated } from "react-native";
import { AnimatedCoordinatesArray } from "./AnimatedCoordinatesArray.js";
import { AnimatedExtractCoordinateFromArray } from "./AnimatedExtractCoordinateFromArray.js";
import { AnimatedGeoJSON } from "./AnimatedGeoJSON.js";
import { AnimatedPoint } from "./AnimatedPoint.js";
import { AnimatedRouteCoordinatesArray } from "./AnimatedRouteCoordinatesArray.js";
import { Marker } from "../../components/annotations/marker/Marker.js";
import { Layer } from "../../components/layer/Layer.js";
import { GeoJSONSource } from "../../components/sources/geojson-source/GeoJSONSource.js";
import { ImageSource } from "../../components/sources/image-source/ImageSource.js";
export const Animated = {
  // Components
  GeoJSONSource: RNAnimated.createAnimatedComponent(GeoJSONSource),
  ImageSource: RNAnimated.createAnimatedComponent(ImageSource),
  Marker: RNAnimated.createAnimatedComponent(Marker),
  Layer: RNAnimated.createAnimatedComponent(Layer),
  // Values
  Point: AnimatedPoint,
  CoordinatesArray: AnimatedCoordinatesArray,
  RouteCoordinatesArray: AnimatedRouteCoordinatesArray,
  GeoJSON: AnimatedGeoJSON,
  ExtractCoordinateFromArray: AnimatedExtractCoordinateFromArray
};
//# sourceMappingURL=Animated.js.map