import asyncio
import contextlib
import importlib.util
import inspect
import io
import pathlib
import unittest


RUNTIME_PATH = pathlib.Path(__file__).parents[1] / "src" / "python-runtime.py"
SPEC = importlib.util.spec_from_file_location("ibm_python_runtime", RUNTIME_PATH)
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)


class PythonRuntimeTests(unittest.TestCase):
    def run_source(self, source, inputs=()):
        values = iter(inputs)

        async def fake_input(_prompt=""):
            try:
                return next(values)
            except StopIteration as exc:
                raise AssertionError("El test pidió más input del esperado") from exc

        previous = runtime._pylab_request_input
        runtime._pylab_request_input = fake_input
        globals_dict = {"__name__": "__main__", "__file__": "test.py"}
        output = io.StringIO()
        try:
            with contextlib.redirect_stdout(output):
                asyncio.run(runtime.__pylab_studio_run_source__(source, "test.py", globals_dict))
        finally:
            runtime._pylab_request_input = previous
        return globals_dict, output.getvalue()

    def test_top_level_input(self):
        globals_dict, output = self.run_source(
            'name = input("Nombre: ")\nprint("Hola", name)\n',
            ["Ada"],
        )
        self.assertEqual(globals_dict["name"], "Ada")
        self.assertEqual(output, "Hola Ada\n")

    def test_input_inside_function_and_call_chain(self):
        source = """
def ask():
    return input("Dato: ")

def wrapper():
    return ask()

value = wrapper()
print(value)
"""
        globals_dict, output = self.run_source(source, ["42"])
        self.assertEqual(globals_dict["value"], "42")
        self.assertEqual(output, "42\n")

    def test_user_defined_module_input_is_not_rewritten(self):
        source = """
def input(prompt=""):
    return 123

value = input("ignorado")
print(value)
"""
        globals_dict, output = self.run_source(source)
        self.assertEqual(globals_dict["value"], 123)
        self.assertEqual(output, "123\n")

    def test_local_input_shadow_is_not_rewritten(self):
        source = """
def calculate():
    input = lambda: 7
    return input()

value = calculate()
print(value)
"""
        globals_dict, output = self.run_source(source)
        self.assertEqual(globals_dict["value"], 7)
        self.assertEqual(output, "7\n")

    def test_same_method_name_does_not_convert_unrelated_method(self):
        source = """
class A:
    def ask(self):
        return input("A: ")

class B:
    def ask(self):
        return 7

b = B()
value = b.ask()
print(value)
"""
        globals_dict, output = self.run_source(source)
        self.assertEqual(globals_dict["value"], 7)
        self.assertEqual(output, "7\n")
        self.assertTrue(inspect.iscoroutinefunction(globals_dict["A"].ask))
        self.assertFalse(inspect.iscoroutinefunction(globals_dict["B"].ask))

    def test_converted_method_can_receive_input(self):
        source = """
class A:
    def ask(self):
        return input("A: ")

a = A()
value = a.ask()
print(value)
"""
        globals_dict, output = self.run_source(source, ["ok"])
        self.assertEqual(globals_dict["value"], "ok")
        self.assertEqual(output, "ok\n")

    def test_input_in_init_is_rejected(self):
        source = """
class A:
    def __init__(self):
        self.value = input("Dato: ")

A()
"""
        with self.assertRaisesRegex(RuntimeError, "__init__"):
            self.run_source(source, ["x"])

    def test_input_in_lambda_is_rejected(self):
        source = "f = lambda: input('Dato: ')\n"
        with self.assertRaisesRegex(RuntimeError, "lambda"):
            self.run_source(source, ["x"])

    def test_input_in_class_body_is_rejected(self):
        source = "class A:\n    value = input('Dato: ')\n"
        with self.assertRaisesRegex(RuntimeError, "cuerpo de una clase"):
            self.run_source(source, ["x"])

    def run_cell(self, source, globals_dict=None):
        globals_dict = globals_dict or {"__name__": "__main__", "__file__": "notebook.ipynb"}
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            asyncio.run(runtime.__pylab_studio_run_cell__(source, "notebook.ipynb", globals_dict))
        return globals_dict, output.getvalue()

    def test_notebook_cell_displays_last_expression(self):
        globals_dict, output = self.run_cell("A = [1, 2, 3]\nlen(A)\n")
        self.assertEqual(output, "3\n")
        self.assertEqual(globals_dict["A"], [1, 2, 3])

    def test_notebook_cells_share_globals(self):
        globals_dict, _ = self.run_cell("value = 21\n")
        _, output = self.run_cell("value * 2\n", globals_dict)
        self.assertEqual(output, "42\n")

    def test_notebook_semicolon_suppresses_last_expression(self):
        _, output = self.run_cell("2 + 3;\n")
        self.assertEqual(output, "")

    def test_notebook_print_does_not_duplicate_none(self):
        _, output = self.run_cell('print("hola")\n')
        self.assertEqual(output, "hola\n")


if __name__ == "__main__":
    unittest.main()
