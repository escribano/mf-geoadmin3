(function() {
  goog.provide('ga_tooltip_directive');

  goog.require('ga_browsersniffer_service');
  goog.require('ga_map_service');
  goog.require('ga_popup_service');

  var module = angular.module('ga_tooltip_directive', [
    'ga_popup_service',
    'ga_map_service',
    'pascalprecht.translate'
  ]);

  module.directive('gaTooltip',
    function($timeout, $document, $http, $q, $translate, $sce, gaPopup,
      gaLayers, gaBrowserSniffer, gaDefinePropertiesForLayer, gaMapClick)
      {
        var waitclass = 'ga-tooltip-wait',
            bodyEl = angular.element($document[0].body),
            popupContent = '<div ng-repeat="htmlsnippet in options.htmls">' +
                              '<div ng-bind-html="htmlsnippet"></div>' +
                              '<div class="tooltip-separator" ' +
                                'ng-show="!$last"></div>' +
                            '</div>';
        return {
          restrict: 'A',
          scope: {
            map: '=gaTooltipMap',
            options: '=gaTooltipOptions'
          },
          link: function($scope, element, attrs) {
            var htmls = [],
                map = $scope.map,
                popup,
                canceler,
                currentTopic,
                vector;

            $scope.$on('gaTopicChange', function(event, topic) {
              currentTopic = topic.id;
            });

            gaMapClick.listen(map, function(evt) {
              var size = map.getSize();
              var mapExtent = map.getView().calculateExtent(size);
              var coordinate = (evt.originalEvent) ?
                  map.getEventCoordinate(evt.originalEvent) :
                  evt.getCoordinate();

              // A digest cycle is necessary for $http requests to be
              // actually sent out. Angular-1.2.0rc2 changed the $evalSync
              // function of the $rootScope service for exactly this. See
              // Angular commit 6b91aa0a18098100e5f50ea911ee135b50680d67.
              // We use a conservative approach and call $apply ourselves
              // here, but we instead could also let $evalSync trigger a
              // digest cycle for us.

              $scope.$apply(function() {
                findFeatures(coordinate, size, mapExtent);
              });
            });

            function findFeatures(coordinate, size, mapExtent) {
              var identifyUrl = $scope.options.identifyUrlTemplate
                                .replace('{Topic}', currentTopic),
                  layersToQuery = getLayersToQuery();
              // Cancel all pending requests
              if (canceler) {
                canceler.resolve();
              }
              // Create new cancel object
              canceler = $q.defer();
              if (layersToQuery.length) {
                // Show wait cursor
                //
                // The tricky part: without the $timeout, the call to
                // canceler.resolve above may schedule the execution of the
                // $http.get error callback, but the execution of the callback
                // will happen after the call to `addClass`. So the class is
                // added and then removed. With $timeout we force the right
                // order of execution.
                $timeout(function() {
                  bodyEl.addClass(waitclass);
                }, 0);

                // Look for all features under clicked pixel
                $http.get(identifyUrl, {
                  timeout: canceler.promise,
                  params: {
                    geometryType: 'esriGeometryPoint',
                    geometryFormat: 'geojson',
                    geometry: coordinate[0] + ',' + coordinate[1],
                    // FIXME: make sure we are passing the right dpi here.
                    imageDisplay: size[0] + ',' + size[1] + ',96',
                    mapExtent: mapExtent.join(','),
                    tolerance: $scope.options.tolerance,
                    layers: 'all:' + layersToQuery
                  }
                }).success(function(features) {
                  if (features.results.length == 0) {
                    // if there are features, keeps waitclass until
                    // popup is displayed
                    bodyEl.removeClass(waitclass);
                  }
                  showFeatures(mapExtent, size, features.results);
                }).error(function() {
                  bodyEl.removeClass(waitclass);
                });
              }

              // htmls = [] would break the reference in the popup
              htmls.splice(0, htmls.length);

              if (popup) {
                popup.close();
              }
            }

            function showFeatures(mapExtent, size, foundFeatures) {
              var drawFeatures = [];
              if (foundFeatures && foundFeatures.length > 0) {
                angular.forEach(foundFeatures, function(value) {
                  var htmlUrl = $scope.options.htmlUrlTemplate
                                .replace('{Topic}', currentTopic)
                                .replace('{Layer}', value.layerBodId)
                                .replace('{Feature}', value.featureId);
                  $http.get(htmlUrl, {
                    timeout: canceler.promise,
                    params: {
                      lang: $translate.uses(),
                      mapExtent: mapExtent.join(','),
                      imageDisplay: size[0] + ',' + size[1] + ',96'
                    }
                  }).success(function(html) {
                    bodyEl.removeClass(waitclass);
                    // Show popup on first result
                    if (htmls.length === 0) {
                      if (!popup) {
                        popup = gaPopup.create({
                          className: 'ga-tooltip',
                          onCloseCallback: function() {
                            map.removeLayer(vector);
                          },
                          destroyOnClose: false,
                          title: 'object_information',
                          content: popupContent,
                          htmls: htmls
                        }, $scope);
                      }
                      popup.open();
                      //always reposition element when newly opened
                      if (!gaBrowserSniffer.mobile) {
                        popup.element.css({
                          top: 89,
                          left: ((size[0] / 2) -
                              (parseFloat(popup.element.css('max-width')) / 2))
                        });
                      }
                    }
                    // Add result to array. ng-repeat will take
                    // care of the rest
                    htmls.push($sce.trustAsHtml(html));
                  }).error(function() {
                    bodyEl.removeClass(waitclass);
                  });

                  //draw feature, but only if it should be drawn
                  if (gaLayers.getLayer(value.layerBodId) &&
                      gaLayers.getLayerProperty(value.layerBodId,
                                                'highlightable')) {
                      drawFeatures.push(value);
                  }
                });

                // A new vector layer is created each time because
                // there is no public function to access the features
                // from the source.
                map.removeLayer(vector);
                vector = new ol.layer.Vector({
                  style: new ol.style.Style({
                    symbolizers: [
                      new ol.style.Fill({
                        color: '#ffff00'
                      }),
                      new ol.style.Stroke({
                        color: '#ff8000',
                        width: 3
                      }),
                      new ol.style.Shape({
                        size: 20,
                        fill: new ol.style.Fill({
                          color: '#ffff00'
                        }),
                        stroke: new ol.style.Stroke({
                          color: '#ff8000',
                          width: 3
                        })
                      })
                    ]
                  }),
                  source: new ol.source.Vector({
                    projection: map.getView().getProjection(),
                    parser: new ol.parser.GeoJSON(),
                    data: {
                      type: 'FeatureCollection',
                      features: drawFeatures
                    }
                  })
                });
                gaDefinePropertiesForLayer(vector);
                vector.highlight = true;
                map.addLayer(vector);
              }
            }

            function getLayersToQuery(layers) {
              var layersToQuery = [];
              map.getLayers().forEach(function(l) {
                var bodId = l.bodId;
                if (gaLayers.getLayer(bodId) &&
                    gaLayers.getLayerProperty(bodId, 'queryable') &&
                    l.visible &&
                    layersToQuery.indexOf(bodId) < 0) {
                  layersToQuery.push(bodId);
                }
              });
              return layersToQuery.join(',');
            }
          }
        };
      });
})();
