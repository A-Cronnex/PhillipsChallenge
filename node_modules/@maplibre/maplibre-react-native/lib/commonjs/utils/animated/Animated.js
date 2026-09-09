"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Animated = void 0;
var _reactNative = require("react-native");
var _AnimatedCoordinatesArray = require("./AnimatedCoordinatesArray.js");
var _AnimatedExtractCoordinateFromArray = require("./AnimatedExtractCoordinateFromArray.js");
var _AnimatedGeoJSON = require("./AnimatedGeoJSON.js");
var _AnimatedPoint = require("./AnimatedPoint.js");
var _AnimatedRouteCoordinatesArray = require("./AnimatedRouteCoordinatesArray.js");
var _Marker = require("../../components/annotations/marker/Marker.js");
var _Layer = require("../../components/layer/Layer.js");
var _GeoJSONSource = require("../../components/sources/geojson-source/GeoJSONSource.js");
var _ImageSource = require("../../components/sources/image-source/ImageSource.js");
const Animated = exports.Animated = {
  // Components
  GeoJSONSource: _reactNative.Animated.createAnimatedComponent(_GeoJSONSource.GeoJSONSource),
  ImageSource: _reactNative.Animated.createAnimatedComponent(_ImageSource.ImageSource),
  Marker: _reactNative.Animated.createAnimatedComponent(_Marker.Marker),
  Layer: _reactNative.Animated.createAnimatedComponent(_Layer.Layer),
  // Values
  Point: _AnimatedPoint.AnimatedPoint,
  CoordinatesArray: _AnimatedCoordinatesArray.AnimatedCoordinatesArray,
  RouteCoordinatesArray: _AnimatedRouteCoordinatesArray.AnimatedRouteCoordinatesArray,
  GeoJSON: _AnimatedGeoJSON.AnimatedGeoJSON,
  ExtractCoordinateFromArray: _AnimatedExtractCoordinateFromArray.AnimatedExtractCoordinateFromArray
};
//# sourceMappingURL=Animated.js.map