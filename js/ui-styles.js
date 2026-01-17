export const styles = {
    // TASK CARD: Premium Look with hover lift
    taskCard: {
        container: "hover-lift bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300 group relative overflow-hidden active:scale-[0.99]",

        // Completed state
        completedModifier: "opacity-60 saturate-50 bg-gray-50 dark:bg-gray-800/50",

        leftContent: "flex-grow min-w-0 flex flex-col justify-center space-y-1.5",
        rightContent: "flex items-center gap-3 flex-wrap justify-end shrink-0"
    },

    // BUTTONS: Modernized (Purple Theme)
    buttons: {
        base: "text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 border min-w-[70px]",

        // Variants
        complete: "bg-white dark:bg-gray-800 text-purple-600 border-gray-200 dark:border-gray-700 hover:bg-purple-50 dark:hover:bg-purple-900/30 hover:border-purple-200 dark:hover:border-purple-800 shadow-sm",
        undo: "bg-white dark:bg-gray-800 text-amber-600 border-gray-200 dark:border-gray-700 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:border-amber-200 dark:hover:border-amber-800 shadow-sm",
        edit: "bg-white dark:bg-gray-800 text-indigo-600 border-gray-200 dark:border-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:border-indigo-200 dark:hover:border-indigo-800 shadow-sm",
        delete: "bg-white dark:bg-gray-800 text-red-600 border-gray-200 dark:border-gray-700 hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-200 dark:hover:border-red-800 shadow-sm",
        details: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-transparent hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
    },

    // BADGES: Vibrant Pills
    badge: {
        base: "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm",
        High: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
        Medium: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
        Low: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
    },

    // TEXT
    text: {
        title: "font-bold text-lg text-gray-900 dark:text-gray-50 font-display leading-tight group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors",
        date: "text-xs text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1.5"
    }
};
