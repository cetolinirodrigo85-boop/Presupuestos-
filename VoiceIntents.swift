// VoiceIntents.swift
// ============================================================
// App Intents para Rodri CFO.
// Requiere: Xcode, iOS 16+, un proyecto de app (puede ser mínimo,
// hasta una app "shell" sin UI propia) con capability "Siri" y
// "App Intents" habilitadas.
//
// Reemplazá:
//   - baseURL: tu dominio real de Vercel
//   - el token: el mismo valor que pusiste en RODRICFO_API_TOKEN
//     (guardalo en Keychain en una versión real; acá va simple
//     para que puedas probarlo rápido)
// ============================================================

import AppIntents
import Foundation
import LocalAuthentication

// ------------------------------------------------------------
// CLIENTE DE API
// ------------------------------------------------------------
enum RodriAPI {
    static let baseURL = "https://TU-DOMINIO.vercel.app/api/voice"
    static let token = "TU-TOKEN-SECRETO"

    struct Respuesta: Decodable {
        let status: String
        let mensaje: String
        let pendingId: String?
        let resultado: String?
    }

    static func request(path: String, method: String, body: [String: Any]? = nil) async throws -> Respuesta {
        guard let url = URL(string: "\(baseURL)/\(path)") else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body = body {
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, _) = try await URLSession.shared.data(for: req)
        return try JSONDecoder().decode(Respuesta.self, from: data)
    }

    /// Pide Face ID / Touch ID antes de confirmar una acción sensible.
    static func confirmarConBiometria(motivo: String) async -> Bool {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return true // si el dispositivo no tiene biometría configurada, no bloqueamos la operación
        }
        do {
            return try await context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: motivo)
        } catch {
            return false
        }
    }

    static func confirmarPendiente(pendingId: String, confirmar: Bool) async throws -> Respuesta {
        try await request(path: "confirm", method: "POST", body: ["pendingId": pendingId, "confirm": confirmar])
    }
}

// ------------------------------------------------------------
// 1. REGISTRAR GASTO
// ------------------------------------------------------------
struct RegisterExpenseIntent: AppIntent {
    static var title: LocalizedStringResource = "Registrar gasto"
    static var description = IntentDescription("Registra un gasto en Rodri CFO")

    @Parameter(title: "Monto")
    var amount: Double

    @Parameter(title: "Categoría")
    var category: String?

    @Parameter(title: "Descripción")
    var itemDescription: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Registrar un gasto de \(\.$amount) en \(\.$category)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        var body: [String: Any] = ["amount": amount]
        if let category { body["category"] = category }
        if let itemDescription { body["description"] = itemDescription }

        let r = try await RodriAPI.request(path: "expense", method: "POST", body: body)

        if r.status == "necesita_confirmacion", let pendingId = r.pendingId {
            let ok = await RodriAPI.confirmarConBiometria(motivo: r.mensaje)
            let final = try await RodriAPI.confirmarPendiente(pendingId: pendingId, confirmar: ok)
            return .result(dialog: IntentDialog(stringLiteral: final.mensaje))
        }

        return .result(dialog: IntentDialog(stringLiteral: r.mensaje))
    }
}

// ------------------------------------------------------------
// 2. REGISTRAR INGRESO
// ------------------------------------------------------------
struct RegisterIncomeIntent: AppIntent {
    static var title: LocalizedStringResource = "Registrar ingreso"
    static var description = IntentDescription("Registra un cobro en Rodri CFO")

    @Parameter(title: "Monto")
    var amount: Double

    @Parameter(title: "Fuente")
    var source: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Registrar un ingreso de \(\.$amount) de \(\.$source)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        var body: [String: Any] = ["amount": amount]
        if let source { body["source"] = source }
        let r = try await RodriAPI.request(path: "income", method: "POST", body: body)
        return .result(dialog: IntentDialog(stringLiteral: r.mensaje))
    }
}

// ------------------------------------------------------------
// 3. CONSULTAR DINERO DISPONIBLE
// ------------------------------------------------------------
struct GetAvailableMoneyIntent: AppIntent {
    static var title: LocalizedStringResource = "Consultar dinero disponible"

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let r = try await RodriAPI.request(path: "balance", method: "GET")
        return .result(dialog: IntentDialog(stringLiteral: r.mensaje))
    }
}

// ------------------------------------------------------------
// 4. ¿PUEDO GASTAR X?
// ------------------------------------------------------------
struct CanIAffordIntent: AppIntent {
    static var title: LocalizedStringResource = "¿Puedo gastar?"

    @Parameter(title: "Monto")
    var amount: Double

    static var parameterSummary: some ParameterSummary {
        Summary("¿Puedo gastar \(\.$amount)?")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let r = try await RodriAPI.request(path: "affordability", method: "POST", body: ["amount": amount])
        return .result(dialog: IntentDialog(stringLiteral: r.mensaje))
    }
}

// ------------------------------------------------------------
// 5. TENGO DINERO EXTRA
// ------------------------------------------------------------
struct RegisterExtraMoneyIntent: AppIntent {
    static var title: LocalizedStringResource = "Tengo dinero extra"

    @Parameter(title: "Monto")
    var amount: Double

    static var parameterSummary: some ParameterSummary {
        Summary("Tengo \(\.$amount) de extra, ¿qué hago?")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let r = try await RodriAPI.request(path: "extra-money", method: "POST", body: ["amount": amount])

        if r.status == "necesita_confirmacion", let pendingId = r.pendingId {
            let ok = await RodriAPI.confirmarConBiometria(motivo: r.mensaje)
            let final = try await RodriAPI.confirmarPendiente(pendingId: pendingId, confirmar: ok)
            return .result(dialog: IntentDialog(stringLiteral: final.mensaje))
        }
        return .result(dialog: IntentDialog(stringLiteral: r.mensaje))
    }
}

// ------------------------------------------------------------
// 6. RESUMEN FINANCIERO
// ------------------------------------------------------------
struct GetFinancialSummaryIntent: AppIntent {
    static var title: LocalizedStringResource = "Resumen financiero"

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let r = try await RodriAPI.request(path: "financial-summary", method: "GET")
        return .result(dialog: IntentDialog(stringLiteral: r.mensaje))
    }
}

// ------------------------------------------------------------
// FRASES DE SIRI / APP SHORTCUTS (sección 24)
// Cada frase DEBE incluir \(.applicationName) — lo exige Apple.
// ------------------------------------------------------------
struct RodriCFOShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: RegisterExpenseIntent(),
            phrases: [
                "Registrar un gasto en \(.applicationName)",
                "Gasté dinero en \(.applicationName)"
            ],
            shortTitle: "Registrar gasto",
            systemImageName: "minus.circle"
        )
        AppShortcut(
            intent: RegisterIncomeIntent(),
            phrases: [
                "Registrar un ingreso en \(.applicationName)",
                "Cobré dinero en \(.applicationName)"
            ],
            shortTitle: "Registrar ingreso",
            systemImageName: "plus.circle"
        )
        AppShortcut(
            intent: GetAvailableMoneyIntent(),
            phrases: [
                "Cuánto dinero tengo en \(.applicationName)",
                "Consultar saldo en \(.applicationName)"
            ],
            shortTitle: "Dinero disponible",
            systemImageName: "wallet.pass"
        )
        AppShortcut(
            intent: CanIAffordIntent(),
            phrases: [
                "Puedo gastar en \(.applicationName)"
            ],
            shortTitle: "¿Puedo gastar?",
            systemImageName: "checkmark.seal"
        )
        AppShortcut(
            intent: RegisterExtraMoneyIntent(),
            phrases: [
                "Tengo dinero extra en \(.applicationName)"
            ],
            shortTitle: "Dinero extra",
            systemImageName: "sparkles"
        )
        AppShortcut(
            intent: GetFinancialSummaryIntent(),
            phrases: [
                "Dame mi resumen financiero de \(.applicationName)",
                "Resumen financiero en \(.applicationName)"
            ],
            shortTitle: "Resumen financiero",
            systemImageName: "chart.pie"
        )
    }
}
