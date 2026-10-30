// Extracts the documentation of Jason's internal actions (the @Manual
// annotations in jason.stdlib) as JSON, for completion and hover.
//
//   java -cp <jason jar> scripts/ExtractStdlib.java > src/stdlib.json

import java.lang.reflect.Method;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

public class ExtractStdlib {
    public static void main(String[] args) throws Exception {
        String jar = Path.of(ExtractStdlib.class.getClassLoader().getResource("jason/stdlib/print.class").toURI()
                .getSchemeSpecificPart().replaceFirst("^file:", "").replaceFirst("!.*$", "")).toString();
        Class<?> manual = Class.forName("jason.stdlib.Manual");
        List<String> entries = new ArrayList<>();
        try (ZipFile zip = new ZipFile(jar)) {
            Enumeration<? extends ZipEntry> it = zip.entries();
            List<String> names = new ArrayList<>();
            while (it.hasMoreElements()) {
                String n = it.nextElement().getName();
                if (n.matches("jason/stdlib/[a-z][a-zA-Z0-9_]*\\.class")) {
                    names.add(n.substring("jason/stdlib/".length(), n.length() - ".class".length()));
                }
            }
            names.sort(null);
            for (String name : names) {
                Object m;
                try {
                    m = Class.forName("jason.stdlib." + name).getAnnotation(manual.asSubclass(java.lang.annotation.Annotation.class));
                } catch (Throwable e) {
                    continue;
                }
                StringBuilder sb = new StringBuilder();
                sb.append("  {\"name\": ").append(str("." + name));
                if (m != null) {
                    sb.append(", \"literal\": ").append(str(call(m, "literal")));
                    sb.append(", \"hint\": ").append(str(call(m, "hint")));
                    sb.append(", \"argsHint\": ").append(arr(call(m, "argsHint")));
                    sb.append(", \"argsType\": ").append(arr(call(m, "argsType")));
                    sb.append(", \"examples\": ").append(arr(call(m, "examples")));
                    sb.append(", \"seeAlso\": ").append(arr(call(m, "seeAlso")));
                }
                sb.append("}");
                entries.add(sb.toString());
            }
        }
        System.out.println("[\n" + String.join(",\n", entries) + "\n]");
    }

    private static Object call(Object annotation, String method) {
        try {
            Method m = annotation.getClass().getMethod(method);
            return m.invoke(annotation);
        } catch (Exception e) {
            return null;
        }
    }

    private static String arr(Object value) {
        if (!(value instanceof String[] items)) {
            return "[]";
        }
        List<String> out = new ArrayList<>();
        for (String s : items) {
            out.add(str(s));
        }
        return "[" + String.join(", ", out) + "]";
    }

    private static String str(Object value) {
        String s = value == null ? "" : value.toString();
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        return sb.append('"').toString();
    }
}
