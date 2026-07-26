import { aggregatePopulationByProvince } from '../utils/provincePopulationAggregation.js'

// Runs the point-in-polygon province aggregation off the main thread — even
// with the bounding-box pre-filter (provincePopulationAggregation.js), a
// few hundred ms to ~2s against the largest served country (Turkey, ~140K
// hex centroids × 81 provinces) is enough to visibly freeze map interaction
// if run synchronously on the UI thread. Mirrors hexWorker.js's existing
// pattern (dedicated worker, not sharing that one — its lazy-init is tied to
// the unrelated hexbins/"Petek" toggle, so this feature needs its own).
self.onmessage = ({ data }) => {
  const { requestId, populationFeatures, provinceFeatureCollection, nameProperty } = data
  const result = aggregatePopulationByProvince(populationFeatures, provinceFeatureCollection, nameProperty)
  self.postMessage({ requestId, result })
}
