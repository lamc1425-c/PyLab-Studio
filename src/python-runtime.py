import ast as _pylab_ast
import inspect as _pylab_inspect
import linecache as _pylab_linecache

try:
    from pylab_studio_bridge import requestInput as _pylab_request_input
except ModuleNotFoundError:  # Permite ejecutar las pruebas del runtime fuera de Pyodide.
    async def _pylab_request_input(_prompt=""):
        raise RuntimeError("pylab_studio_bridge no está disponible fuera de Pyodide")


class _PyLabInputBindingFinder(_pylab_ast.NodeVisitor):
    """Detecta si un ámbito enlaza el nombre ``input`` sin entrar en ámbitos hijos."""

    def __init__(self):
        self.binds_input = False
        self.global_input = False
        self.nonlocal_input = False

    def _bind_target(self, target):
        if isinstance(target, _pylab_ast.Name) and target.id == "input":
            self.binds_input = True
        elif isinstance(target, (_pylab_ast.Tuple, _pylab_ast.List)):
            for element in target.elts:
                self._bind_target(element)
        elif isinstance(target, _pylab_ast.Starred):
            self._bind_target(target.value)

    def visit_Global(self, node):
        if "input" in node.names:
            self.global_input = True

    def visit_Nonlocal(self, node):
        if "input" in node.names:
            self.nonlocal_input = True

    def visit_Assign(self, node):
        for target in node.targets:
            self._bind_target(target)
        self.visit(node.value)

    def visit_AnnAssign(self, node):
        self._bind_target(node.target)
        if node.value is not None:
            self.visit(node.value)

    def visit_AugAssign(self, node):
        self._bind_target(node.target)
        self.visit(node.value)

    def visit_NamedExpr(self, node):
        self._bind_target(node.target)
        self.visit(node.value)

    def visit_For(self, node):
        self._bind_target(node.target)
        self.visit(node.iter)
        for statement in node.body:
            self.visit(statement)
        for statement in node.orelse:
            self.visit(statement)

    visit_AsyncFor = visit_For

    def visit_With(self, node):
        for item in node.items:
            self.visit(item.context_expr)
            if item.optional_vars is not None:
                self._bind_target(item.optional_vars)
        for statement in node.body:
            self.visit(statement)

    visit_AsyncWith = visit_With

    def visit_ExceptHandler(self, node):
        if node.name == "input":
            self.binds_input = True
        if node.type is not None:
            self.visit(node.type)
        for statement in node.body:
            self.visit(statement)

    def visit_Import(self, node):
        for alias in node.names:
            bound_name = alias.asname or alias.name.split(".", 1)[0]
            if bound_name == "input":
                self.binds_input = True

    def visit_ImportFrom(self, node):
        for alias in node.names:
            bound_name = alias.asname or alias.name
            if bound_name == "input":
                self.binds_input = True

    def visit_FunctionDef(self, node):
        if node.name == "input":
            self.binds_input = True
        # El cuerpo pertenece a otro ámbito.

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ClassDef(self, node):
        if node.name == "input":
            self.binds_input = True
        # El cuerpo pertenece a otro ámbito.

    def visit_Lambda(self, node):
        # Lambda crea su propio ámbito.
        return


def _pylab_scope_input_binding(statements):
    finder = _PyLabInputBindingFinder()
    for statement in statements:
        finder.visit(statement)
    return finder


def _pylab_function_input_binding(node):
    finder = _pylab_scope_input_binding(node.body)
    parameters = [
        *node.args.posonlyargs,
        *node.args.args,
        *node.args.kwonlyargs,
    ]
    if node.args.vararg is not None:
        parameters.append(node.args.vararg)
    if node.args.kwarg is not None:
        parameters.append(node.args.kwarg)
    if any(argument.arg == "input" for argument in parameters):
        finder.binds_input = True
    return finder


class _PyLabInputAnalysis(_pylab_ast.NodeVisitor):
    def __init__(self, tree):
        module_binding = _pylab_scope_input_binding(tree.body)
        self.module_shadows_input = module_binding.binds_input
        self.function_stack = []
        self.qual_stack = []
        self.scope_kind_stack = ["module"]
        self.class_parent_shadow_stack = []
        self.input_shadow_stack = [self.module_shadows_input]
        self.function_nodes = {}
        self.function_names = {}
        self.node_keys = {}
        self.original_async = set()
        self.direct_input = set()
        self.builtin_input_calls = set()
        self.calls = []
        self.unsupported = []

    @property
    def current_function(self):
        return self.function_stack[-1] if self.function_stack else "<module>"

    @property
    def input_shadowed(self):
        return self.input_shadow_stack[-1]

    def _function_key(self, node):
        prefix = ".".join(self.qual_stack)
        base = f"{node.name}@{node.lineno}:{node.col_offset}"
        return f"{prefix}.{base}" if prefix else base

    def _visit_definition_expressions(self, node):
        for decorator in node.decorator_list:
            self.visit(decorator)
        for default in node.args.defaults:
            self.visit(default)
        for default in node.args.kw_defaults:
            if default is not None:
                self.visit(default)
        if node.returns is not None:
            self.visit(node.returns)

    def _visit_function(self, node, is_async):
        # Decoradores, defaults y anotaciones se evalúan en el ámbito exterior.
        self._visit_definition_expressions(node)

        key = self._function_key(node)
        self.function_nodes[key] = node
        self.node_keys[id(node)] = key
        self.function_names.setdefault(node.name, set()).add(key)
        if is_async:
            self.original_async.add(key)

        binding = _pylab_function_input_binding(node)
        inherited_shadow = self.input_shadowed
        if self.scope_kind_stack[-1] == "class":
            # Los métodos no capturan el namespace de la clase como cierre léxico.
            inherited_shadow = self.class_parent_shadow_stack[-1]
        if binding.global_input:
            shadows_input = self.module_shadows_input
        elif binding.nonlocal_input:
            shadows_input = inherited_shadow
        else:
            shadows_input = binding.binds_input or inherited_shadow

        self.function_stack.append(key)
        self.qual_stack.append(node.name)
        self.scope_kind_stack.append("function")
        self.input_shadow_stack.append(shadows_input)
        for statement in node.body:
            self.visit(statement)
        self.input_shadow_stack.pop()
        self.scope_kind_stack.pop()
        self.qual_stack.pop()
        self.function_stack.pop()

    def visit_FunctionDef(self, node):
        self._visit_function(node, False)

    def visit_AsyncFunctionDef(self, node):
        self._visit_function(node, True)

    def visit_Lambda(self, node):
        # Si hay input builtin en una lambda, no podemos convertir la lambda en async.
        binding = _PyLabInputBindingFinder()
        for argument in [*node.args.posonlyargs, *node.args.args, *node.args.kwonlyargs]:
            if argument.arg == "input":
                binding.binds_input = True
        inherited = self.input_shadowed
        self.input_shadow_stack.append(binding.binds_input or inherited)
        before = len(self.builtin_input_calls)
        self.visit(node.body)
        self.input_shadow_stack.pop()
        if len(self.builtin_input_calls) > before:
            self.unsupported.append("input() dentro de una función lambda")

    def visit_ClassDef(self, node):
        for decorator in node.decorator_list:
            self.visit(decorator)
        for base in node.bases:
            self.visit(base)
        for keyword in node.keywords:
            self.visit(keyword.value)

        class_binding = _pylab_scope_input_binding(node.body)
        parent_shadow = self.input_shadowed
        class_shadow = class_binding.binds_input or parent_shadow
        self.qual_stack.append(node.name)
        self.scope_kind_stack.append("class")
        self.class_parent_shadow_stack.append(parent_shadow)
        self.input_shadow_stack.append(class_shadow)
        for statement in node.body:
            self.visit(statement)
        self.input_shadow_stack.pop()
        self.class_parent_shadow_stack.pop()
        self.scope_kind_stack.pop()
        self.qual_stack.pop()

    def visit_Call(self, node):
        if isinstance(node.func, _pylab_ast.Name) and node.func.id == "input":
            if self.scope_kind_stack[-1] == "class":
                # El namespace de una clase se resuelve dinámicamente durante su creación;
                # reescribirlo de forma estática puede cambiar qué ``input`` se invoca.
                self.unsupported.append("input() directamente dentro del cuerpo de una clase")
            elif not self.input_shadowed:
                self.builtin_input_calls.add(id(node))
                self.direct_input.add(self.current_function)
        else:
            target_name = None
            if isinstance(node.func, _pylab_ast.Name):
                target_name = node.func.id
            elif isinstance(node.func, _pylab_ast.Attribute):
                target_name = node.func.attr
            if target_name:
                self.calls.append((self.current_function, id(node), target_name))
        self.generic_visit(node)


def _pylab_contains_yield(function_node):
    class _YieldFinder(_pylab_ast.NodeVisitor):
        def __init__(self):
            self.found = False

        def visit_Yield(self, node):
            self.found = True

        def visit_YieldFrom(self, node):
            self.found = True

        def visit_FunctionDef(self, node):
            if node is function_node:
                for statement in node.body:
                    self.visit(statement)

        def visit_AsyncFunctionDef(self, node):
            if node is function_node:
                for statement in node.body:
                    self.visit(statement)

    finder = _YieldFinder()
    finder.visit(function_node)
    return finder.found


class _PyLabInputTransformer(_pylab_ast.NodeTransformer):
    def __init__(self, analysis, converted_functions, await_calls):
        self.analysis = analysis
        self.converted_functions = converted_functions
        self.await_calls = await_calls

    def _as_async_function(self, node):
        values = {field: getattr(node, field) for field in _pylab_ast.AsyncFunctionDef._fields}
        replacement = _pylab_ast.AsyncFunctionDef(**values)
        return _pylab_ast.copy_location(replacement, node)

    def visit_FunctionDef(self, node):
        original_id = id(node)
        node = self.generic_visit(node)
        key = self.analysis.node_keys.get(original_id)
        if key in self.converted_functions:
            return self._as_async_function(node)
        return node

    def visit_Await(self, node):
        node.value = self.visit(node.value)
        if isinstance(node.value, _pylab_ast.Await):
            return node.value
        return node

    def visit_Call(self, node):
        original_id = id(node)
        node = self.generic_visit(node)

        if original_id in self.analysis.builtin_input_calls:
            replacement = _pylab_ast.Call(
                func=_pylab_ast.Name(id="__pylab_studio_async_input__", ctx=_pylab_ast.Load()),
                args=node.args,
                keywords=node.keywords,
            )
            return _pylab_ast.copy_location(_pylab_ast.Await(value=replacement), node)

        if original_id in self.await_calls:
            maybe_await = _pylab_ast.Call(
                func=_pylab_ast.Name(id="__pylab_studio_maybe_await__", ctx=_pylab_ast.Load()),
                args=[node],
                keywords=[],
            )
            return _pylab_ast.copy_location(_pylab_ast.Await(value=maybe_await), node)
        return node


async def __pylab_studio_async_input__(prompt=""):
    value = await _pylab_request_input(str(prompt))
    if value is None:
        raise EOFError
    return str(value)


async def __pylab_studio_maybe_await__(value):
    if _pylab_inspect.isawaitable(value):
        return await value
    return value


def _pylab_plan_transform(analysis):
    converted = {
        key
        for key in analysis.direct_input
        if key in analysis.function_nodes and key not in analysis.original_async
    }
    await_calls = set()

    changed = True
    while changed:
        changed = False
        for caller, call_id, target_name in analysis.calls:
            possible_targets = analysis.function_names.get(target_name, set())
            if not possible_targets.intersection(converted):
                continue

            await_calls.add(call_id)
            if (
                caller in analysis.function_nodes
                and caller not in analysis.original_async
                and caller not in converted
            ):
                converted.add(caller)
                changed = True

    return converted, await_calls


def _pylab_prepare_tree(source, filename):
    tree = _pylab_ast.parse(source, filename=filename, mode="exec")
    analysis = _PyLabInputAnalysis(tree)
    analysis.visit(tree)

    if analysis.unsupported:
        raise RuntimeError(
            "Esta versión no puede pausar " + analysis.unsupported[0] + ". "
            "Usa input() en el programa principal o dentro de una función normal."
        )

    converted, await_calls = _pylab_plan_transform(analysis)

    init_functions = [
        analysis.function_nodes[key]
        for key in converted
        if analysis.function_nodes[key].name == "__init__"
    ]
    if init_functions:
        raise RuntimeError(
            "input() dentro de __init__ no está disponible todavía. "
            "Solicita el dato antes de crear el objeto y pásalo como argumento."
        )

    for function_key in converted:
        function_node = analysis.function_nodes[function_key]
        if _pylab_contains_yield(function_node):
            raise RuntimeError(
                "input() dentro de un generador con yield no está disponible todavía."
            )

    if analysis.builtin_input_calls or converted:
        tree = _PyLabInputTransformer(analysis, converted, await_calls).visit(tree)
        _pylab_ast.fix_missing_locations(tree)

    _pylab_linecache.cache[filename] = (
        len(source),
        None,
        source.splitlines(True),
        filename,
    )
    return tree


async def _pylab_execute_tree(tree, filename, user_globals, capture_last_expression=False):
    result_key = "__pylab_studio_cell_result__"
    capture_result = False

    if capture_last_expression and tree.body and isinstance(tree.body[-1], _pylab_ast.Expr):
        final_expression = tree.body[-1]
        assignment = _pylab_ast.Assign(
            targets=[_pylab_ast.Name(id=result_key, ctx=_pylab_ast.Store())],
            value=final_expression.value,
        )
        tree.body[-1] = _pylab_ast.copy_location(assignment, final_expression)
        _pylab_ast.fix_missing_locations(tree)
        capture_result = True

    compiled = compile(
        tree,
        filename,
        "exec",
        flags=_pylab_ast.PyCF_ALLOW_TOP_LEVEL_AWAIT,
        dont_inherit=True,
    )
    helpers = {
        "__pylab_studio_async_input__": __pylab_studio_async_input__,
        "__pylab_studio_maybe_await__": __pylab_studio_maybe_await__,
    }
    sentinel = object()
    previous = {name: user_globals.get(name, sentinel) for name in helpers}
    previous_result = user_globals.get(result_key, sentinel)
    user_globals.update(helpers)
    try:
        result = eval(compiled, user_globals, user_globals)
        if _pylab_inspect.isawaitable(result):
            await result
        if capture_result:
            cell_result = user_globals.get(result_key, sentinel)
            if cell_result is not sentinel and cell_result is not None:
                print(repr(cell_result))
    finally:
        if previous_result is sentinel:
            user_globals.pop(result_key, None)
        else:
            user_globals[result_key] = previous_result
        for name, old_value in previous.items():
            if old_value is sentinel:
                user_globals.pop(name, None)
            else:
                user_globals[name] = old_value


async def __pylab_studio_run_source__(source, filename, user_globals):
    tree = _pylab_prepare_tree(source, filename)
    await _pylab_execute_tree(tree, filename, user_globals, capture_last_expression=False)


async def __pylab_studio_run_cell__(source, filename, user_globals):
    tree = _pylab_prepare_tree(source, filename)
    # Jupyter no muestra el valor de la última expresión si la celda termina en ';'.
    capture_last = not source.rstrip().endswith(";")
    await _pylab_execute_tree(tree, filename, user_globals, capture_last_expression=capture_last)

