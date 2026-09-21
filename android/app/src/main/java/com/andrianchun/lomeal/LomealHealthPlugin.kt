package com.andrianchun.lomeal

import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.MealType
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import androidx.health.connect.client.units.Volume
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeParseException

@CapacitorPlugin(name = "LomealHealth")
class LomealHealthPlugin : Plugin() {
    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        pluginScope.cancel()
    }

    private fun getClient(): HealthConnectClient? {
        val status = HealthConnectClient.getSdkStatus(context)
        if (status != HealthConnectClient.SDK_AVAILABLE) {
            return null
        }
        return HealthConnectClient.getOrCreate(context)
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val status = HealthConnectClient.getSdkStatus(context)
        val res = JSObject().apply {
            put("available", status == HealthConnectClient.SDK_AVAILABLE)
            put("status", status)
        }
        call.resolve(res)
    }

    @PluginMethod
    fun syncDayNutrition(call: PluginCall) {
        val ymd = call.getString("ymd")
        if (ymd.isNullOrBlank()) {
            call.reject("Parameter 'ymd' (YYYY-MM-DD) is required")
            return
        }

        val mealsArray = call.getArray("meals") ?: JSArray()

        pluginScope.launch(Dispatchers.IO) {
            val client = getClient()
            if (client == null) {
                call.reject("Health Connect is not available on this device")
                return@launch
            }

            try {
                val zoneId = ZoneId.systemDefault()
                val date = LocalDate.parse(ymd)
                val startOfDay = date.atStartOfDay(zoneId).toInstant()
                val endOfDay = date.plusDays(1).atStartOfDay(zoneId).toInstant()

                // 1. Bersihkan record nutrisi Lomeal yang ada di hari ini agar tidak ada remah delta menumpuk
                try {
                    client.deleteRecords(
                        NutritionRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(startOfDay, endOfDay)
                    )
                } catch (e: Exception) {
                    Log.w("LomealHealth", "deleteRecords failed (non-critical): ${e.message}")
                }

                // 2. Bangun NutritionRecord lengkap per sesi makan
                val recordsToInsert = mutableListOf<NutritionRecord>()

                for (i in 0 until mealsArray.length()) {
                    val item = mealsArray.optJSONObject(i) ?: continue
                    val kcal = item.optDouble("kcal", 0.0)
                    val protein = item.optDouble("protein", 0.0)
                    val carbs = item.optDouble("carbs", 0.0)
                    val fat = item.optDouble("fat", 0.0)
                    val fiber = item.optDouble("fiber", 0.0)
                    val sugar = item.optDouble("sugar", 0.0)
                    val sodium = item.optDouble("sodium", 0.0) // mg
                    val name = item.optString("name", "").takeIf { it.isNotBlank() }
                    val mealTypeInt = item.optInt("mealType", MealType.MEAL_TYPE_UNKNOWN)

                    // Skip jika sesi kosong tanpa nutrisi sama sekali
                    if (kcal <= 0.0 && protein <= 0.0 && carbs <= 0.0 && fat <= 0.0) {
                        continue
                    }

                    val defaultStart = date.atTime(12, 0).atZone(zoneId).toInstant()
                    val startInstant = parseTime(item.optString("startTime"), zoneId, defaultStart)
                    var endInstant = parseTime(item.optString("endTime"), zoneId, startInstant.plusSeconds(900)) // default 15 menit
                    if (!endInstant.isAfter(startInstant)) {
                        endInstant = startInstant.plusSeconds(60) // minimal 1 menit
                    }

                    val startOffset = zoneId.rules.getOffset(startInstant)
                    val endOffset = zoneId.rules.getOffset(endInstant)

                    val record = NutritionRecord(
                        startTime = startInstant,
                        startZoneOffset = startOffset,
                        endTime = endInstant,
                        endZoneOffset = endOffset,
                        energy = if (kcal > 0) Energy.kilocalories(kcal) else null,
                        totalCarbohydrate = if (carbs >= 0) Mass.grams(carbs) else null,
                        protein = if (protein >= 0) Mass.grams(protein) else null,
                        totalFat = if (fat >= 0) Mass.grams(fat) else null,
                        dietaryFiber = if (fiber > 0) Mass.grams(fiber) else null,
                        sugar = if (sugar > 0) Mass.grams(sugar) else null,
                        sodium = if (sodium > 0) Mass.milligrams(sodium) else null,
                        name = name,
                        mealType = mealTypeInt,
                        metadata = Metadata.manualEntry()
                    )
                    recordsToInsert.add(record)
                }

                if (recordsToInsert.isNotEmpty()) {
                    client.insertRecords(recordsToInsert)
                }

                val res = JSObject().apply {
                    put("success", true)
                    put("synced", recordsToInsert.size)
                }
                call.resolve(res)
            } catch (e: Exception) {
                Log.e("LomealHealth", "syncDayNutrition error: ${e.message}", e)
                call.reject("Gagal sinkron nutrisi ke Health Connect: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun syncDayHydration(call: PluginCall) {
        val ymd = call.getString("ymd")
        if (ymd.isNullOrBlank()) {
            call.reject("Parameter 'ymd' is required")
            return
        }
        val waterMl = call.getDouble("waterMl") ?: 0.0

        pluginScope.launch(Dispatchers.IO) {
            val client = getClient()
            if (client == null) {
                call.reject("Health Connect is not available")
                return@launch
            }

            try {
                val zoneId = ZoneId.systemDefault()
                val date = LocalDate.parse(ymd)
                val startOfDay = date.atStartOfDay(zoneId).toInstant()
                val endOfDay = date.plusDays(1).atStartOfDay(zoneId).toInstant()

                // Bersihkan record hidrasi hari ini
                try {
                    client.deleteRecords(
                        HydrationRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(startOfDay, endOfDay)
                    )
                } catch (e: Exception) {
                    Log.w("LomealHealth", "delete HydrationRecord failed: ${e.message}")
                }

                if (waterMl > 0) {
                    val startInstant = date.atTime(8, 0).atZone(zoneId).toInstant()
                    val endInstant = date.atTime(21, 0).atZone(zoneId).toInstant()
                    val record = HydrationRecord(
                        startTime = startInstant,
                        startZoneOffset = zoneId.rules.getOffset(startInstant),
                        endTime = endInstant,
                        endZoneOffset = zoneId.rules.getOffset(endInstant),
                        volume = Volume.liters(waterMl / 1000.0),
                        metadata = Metadata.manualEntry()
                    )
                    client.insertRecords(listOf(record))
                }

                val res = JSObject().apply {
                    put("success", true)
                    put("liters", waterMl / 1000.0)
                }
                call.resolve(res)
            } catch (e: Exception) {
                Log.e("LomealHealth", "syncDayHydration error: ${e.message}", e)
                call.reject("Gagal sinkron hidrasi ke Health Connect: ${e.message}", e)
            }
        }
    }

    private fun parseTime(timeStr: String?, zoneId: ZoneId, defaultInstant: Instant): Instant {
        if (timeStr.isNullOrBlank()) return defaultInstant
        return try {
            Instant.parse(timeStr)
        } catch (_: DateTimeParseException) {
            try {
                OffsetDateTime.parse(timeStr).toInstant()
            } catch (_: DateTimeParseException) {
                try {
                    LocalDateTime.parse(timeStr).atZone(zoneId).toInstant()
                } catch (_: DateTimeParseException) {
                    defaultInstant
                }
            }
        }
    }
}
