/**
 * Resource Inventory Store — field capacity (personnel/equipment/vehicles/
 * supplies) directory (spec 062). Same direct-Supabase-client pattern as
 * contacts.js/sources.js — RLS (20260810125000_resource_capacity_inventory.sql)
 * is the authoritative scoping; this store adds no client-side filter.
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/services/api/config.js'

export const useResourceInventoryStore = defineStore('resourceInventory', () => {
  const resources = ref([])
  const loading = ref(false)
  const error = ref(null)

  async function fetchResources() {
    loading.value = true
    error.value = null
    const { data, error: err } = await supabase
      .from('resource_inventory')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) error.value = err.message
    else resources.value = data ?? []
    loading.value = false
  }

  async function createResource(payload) {
    const { data, error: err } = await supabase
      .from('resource_inventory')
      .insert(payload)
      .select()
      .single()
    if (err) { error.value = err.message; throw err }
    resources.value.unshift(data)
    return data
  }

  async function updateResource(id, payload) {
    const { data, error: err } = await supabase
      .from('resource_inventory')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (err) { error.value = err.message; throw err }
    const idx = resources.value.findIndex((r) => r.id === id)
    if (idx !== -1) resources.value[idx] = data
    return data
  }

  async function deleteResource(id) {
    const { error: err } = await supabase.from('resource_inventory').delete().eq('id', id)
    if (err) { error.value = err.message; throw err }
    resources.value = resources.value.filter((r) => r.id !== id)
  }

  return {
    resources,
    loading,
    error,
    fetchResources,
    createResource,
    updateResource,
    deleteResource,
  }
})
