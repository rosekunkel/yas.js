Yas = (function() {
    var my = {};
    var opcodes = {
        'nop'    : 0x00,
        'halt'   : 0x10,
        'rrmovl' : 0x20,
        'cmovle' : 0x21,
        'cmovl'  : 0x22,
        'cmove'  : 0x23,
        'cmovne' : 0x24,
        'cmovge' : 0x25,
        'cmovg'  : 0x26,
        'irmovl' : 0x30,
        'rmmovl' : 0x40,
        'mrmovl' : 0x50,
        'addl'   : 0x60,
        'subl'   : 0x61,
        'andl'   : 0x62,
        'xorl'   : 0x63,
        'multl'  : 0x64,
        'divl'   : 0x65,
        'modl'   : 0x66,
        'jmp'    : 0x70,
        'jle'    : 0x71,
        'jl'     : 0x72,
        'je'     : 0x73,
        'jne'    : 0x74,
        'jge'    : 0x75,
        'jg'     : 0x76,
        'call'   : 0x80,
        'ret'    : 0x90,
        'pushl'  : 0xa0,
        'popl'   : 0xb0,
        'rdch'   : 0xf0,
        'wrch'   : 0xf1,
        'rdint'  : 0xf2,
        'wrint'  : 0xf3
    };
    var reverseOpcodes = {};
    for (instruction in opcodes) {
        reverseOpcodes[opcodes[instruction]] = instruction;
    }

    var registerCodes = {
        '%eax' : 0x00,
        '%ecx' : 0x01,
        '%edx' : 0x02,
        '%ebx' : 0x03,
        '%esp' : 0x04,
        '%ebp' : 0x05,
        '%esi' : 0x06,
        '%edi' : 0x07,
        'none' : 0x08
    };
    var reverseRegisterCodes = {};
    for (register in registerCodes) {
        reverseRegisterCodes[registerCodes[register]] = register;
    }

    var noArgInstructions = ['halt', 'nop', 'ret'];
    var regInstructions = ['pushl', 'popl', 'rdch', 'wrch', 'rdint', 'wrint'];
    var labelInstructions = ['jmp', 'jle', 'jl', 'je',
                             'jne', 'jge', 'jg', 'call'];
    var regRegInstructions = ['rrmovl', 'cmovle', 'cmovl', 'cmove', 'cmovne',
                              'cmovge', 'cmovg', 'addl', 'subl', 'andl',
                              'xorl', 'multl', 'divl', 'modl'];
    var directives = ['pos', 'align', 'long'];
    var registers = ['%eax', '%ebx', '%ecx', '%edx',
                     '%esp', '%ebp', '%esi', '%edi'];

    var registerPattern = '(?:' + registers.join('|') + ')';
    var labelPattern = '(?:[a-zA-Z_]+)';
    var decimalPattern = '(?:-?[0-9]+)';
    var hexPattern = '(?:-?0x[0-9a-fA-F]+)';
    var numericPattern = '(?:' + decimalPattern + '|' + hexPattern + ')';
    var addressPattern =
        '(?:(' + numericPattern + ')?\\((' + registerPattern + ')\\))';
    var spacePattern = '(?:\\s+)';
    var commaPattern = '(?:\\s*,\\s*)';
    var commentPattern = '(?:#.*)';
    var noArgInstructionPattern = '(' + noArgInstructions.join('|') + ')';
    var regInstructionPattern =
        '(?:(' + regInstructions.join('|') + ')' +
        spacePattern +
        '(' + registerPattern + '))';
    var labelInstructionPattern =
        '(?:(' + labelInstructions.join('|') + ')' +
        spacePattern +
        '(' + labelPattern + '))';
    var regRegInstructionPattern =
        '(?:(' + regRegInstructions.join('|') + ')' +
        spacePattern +
        '(' + registerPattern + ')' +
        commaPattern +
        '(' + registerPattern + '))';
    var irmovlPattern =
        '(?:irmovl' +
        spacePattern +
        '(?:(?:\\$?(' + numericPattern + '))|(' + labelPattern + '))' +
        commaPattern +
        '(' + registerPattern + '))';
    var rmmovlPattern =
        '(?:rmmovl' +
        spacePattern +
        '(' + registerPattern + ')' +
        commaPattern +
        addressPattern + ')';
    var mrmovlPattern =
        '(?:mrmovl' +
        spacePattern +
        addressPattern +
        commaPattern +
        '(' + registerPattern + '))';
    var directivePattern =
        '(?:\\.(' + directives.join('|') + ')' +
        spacePattern +
        '(' + numericPattern + '))';
    var instructionPattern =
        '(?:(' +
        noArgInstructionPattern + '|' +
        regInstructionPattern + '|' +
        labelInstructionPattern + '|' +
        regRegInstructionPattern + '|' +
        irmovlPattern + '|' +
        rmmovlPattern + '|' +
        mrmovlPattern + 
        '))';
    var linePattern =
        '^\\s*' +
        '(?:(' + labelPattern + '):)?' +
        '\\s*' +
        '(' + instructionPattern + '|' + directivePattern + ')?' +
        '\\s*' +
        '(?:' + commentPattern + ')?$';

    function packRegisters(r1, r2) {
        return (registerCodes[r1] << 4) | registerCodes[r2];
    }

    function intToByteArray(val) {
        return [(val & 0x000000ff) >> 0,
                (val & 0x0000ff00) >> 8,
                (val & 0x00ff0000) >> 16,
                (val & 0xff000000) >> 24];
    }

    my.ParseException = function (message) {
        this.message = message;
    }

    function MissingAddress(label) {
        this.label = label;
    }

    my.assemble = function(source) {
        var lines = source.match(/[^\r\n]+/g);
        var result = []; // Change back
        var address = 0;
        var labels = {};

        if (lines !== null) {
            // Scan for labels first
            lines.forEach(function(line, index, array) {
                console.log(line);
                var lineMatches = line.match(new RegExp(linePattern));

                if (lineMatches === null) {
                    console.log(mrmovlPattern);
                    throw new my.ParseException('Invalid line');
                }

                var label = lineMatches[1];
                if (label !== undefined) {
                    if (labels[label] !== undefined) {
                        throw new my.ParseException('Redefining label');
                    }

                    // We don't know what the address is yet
                    labels[label] = new MissingAddress(label);
                }
            });

            lines.forEach(function(line, index, array) {
                var lineMatches = line.match(new RegExp(linePattern));

                if (lineMatches === null) {
                    throw new my.ParseException('Invalid line');
                }

                var label = lineMatches[1];
                if (label !== undefined) {
                    labels[label] = address;
                }

                var instruction = lineMatches[2];
                if (instruction === undefined) {
                    return;
                }

                var instructionMatches = null;
                var fullOpcode;
                var opcodeSize;

                if (instructionMatches = instruction.
                    match(new RegExp(noArgInstructionPattern))) {
                    var opcode = opcodes[instructionMatches[1]];
                    fullOpcode = [opcode];
                    opcodeSize = fullOpcode.length;
                } else if (instructionMatches = instruction.
                           match(new RegExp(regInstructionPattern))) {
                    var opcode = opcodes[instructionMatches[1]];
                    var regParam = instructionMatches[2];
                    fullOpcode = [opcode, packRegisters(regParam, 'none')];
                    opcodeSize = fullOpcode.length;
                } else if (instructionMatches = instruction.
                           match(new RegExp(labelInstructionPattern))) {
                    var opcode = opcodes[instructionMatches[1]];
                    var labelParam = instructionMatches[2];

                    if (labels[labelParam] === undefined) {
                        throw new my.ParseException('Label undefined');
                    }

                    var addr = labels[labelParam];
                    var opcodeStart = [opcode];

                    if (addr instanceof MissingAddress) {
                        fullOpcode = opcodeStart.concat([addr]);
                        opcodeSize = opcodeStart.length + 4;
                    } else {
                        fullOpcode = opcodeStart.concat(intToByteArray(addr));
                        opcodeSize = fullOpcode.length;
                    }
                } else if (instructionMatches = instruction.
                           match(new RegExp(regRegInstructionPattern))) {
                    var opcode = opcodes[instructionMatches[1]];
                    var regParam1 = instructionMatches[2];
                    var regParam2 = instructionMatches[3];

                    fullOpcode = [opcode, packRegisters(regParam1, regParam2)];
                    opcodeSize = fullOpcode.length;
                } else if (instructionMatches = instruction.
                           match(new RegExp(irmovlPattern))) {
                    var opcode = opcodes['irmovl'];
                    var regParam = instructionMatches[3];
                    var value;

                    if (instructionMatches[1] !== undefined) {
                        var numberParam = instructionMatches[1];

                        if (numberParam.match(new RegExp(hexPattern))) {
                            console.log('hex')
                            value = parseInt(numberParam, 16);
                        } else {
                            console.log('dec');
                            value = parseInt(numberParam, 10);
                        }
                    } else {
                        var labelParam = instructionMatches[2];

                        if (labels[labelParam] == undefined) {
                            throw new my.ParseException('Label undefined');
                        }

                        value = labels[labelParam];
                    }

                    var opcodeStart = [opcode, packRegisters('none', regParam)];
                    if (value instanceof MissingAddress) {
                        fullOpcode = opcodeStart.concat([value]);
                        opcodeSize = opcodeStart.length + 4;
                    } else {
                        fullOpcode = opcodeStart.concat(intToByteArray(value));
                        opcodeSize = fullOpcode.length;
                    }
                } else if (instructionMatches = instruction.
                           match(new RegExp(rmmovlPattern))) {
                    var opcode = opcodes['rmmovl'];
                    var regParam1 = instructionMatches[1];
                    var regParam2 = instructionMatches[3];
                    var offset = instructionMatches[2];
                    var offsetValue;

                    if (offset === undefined) {
                        offsetValue = 0;
                    } else if (offset.match(new RegExp(decimalPattern))) {
                        offsetValue = parseInt(offset, 10);
                    } else {
                        offsetValue = parseInt(offset, 16);
                    }

                    var opcodeStart = [opcode, packRegisters(regParam1, regParam2)];
                    fullOpcode = opcodeStart.concat(intToByteArray(offsetValue));
                    opcodeSize = fullOpcode.length;
                } else if (instructionMatches = instruction.
                           match(new RegExp(mrmovlPattern))) {
                    console.log('parsing an mrmovl');
                    var opcode = opcodes['mrmovl'];
                    var regParam1 = instructionMatches[2];
                    var regParam2 = instructionMatches[3];
                    var offset = instructionMatches[1];
                    var offsetValue;

                    if (offset === undefined) {
                        offsetValue = 0;
                    } else if (offset.match(new RegExp(decimalPattern))) {
                        offsetValue = parseInt(offset, 10);
                    } else {
                        offsetValue = parseInt(offset, 16);
                    }

                    var opcodeStart = [opcode, packRegisters(regParam2, regParam1)];
                    fullOpcode = opcodeStart.concat(intToByteArray(offsetValue));
                    opcodeSize = fullOpcode.length;
                } else if (instructionMatches = instruction.
                           match(new RegExp(directivePattern))) {
                    var directive = instructionMatches[1];
                    var arg = instructionMatches[2];
                    var argValue;

                    if (arg.match(new RegExp(decimalPattern))) {
                        argValue = parseInt(arg, 10);
                    } else {
                        argValue = parseInt(arg, 16);
                    }

                    switch (directive) {
                    case 'pos':
                        result.push({address: address,
                                     opcode: null,
                                     source: line});

                        address = argValue;
                        return;
                    case 'align':
                        result.push({address: address,
                                     opcode: null,
                                     source: line});

                        if (address % argValue !== 0) {
                            address += argValue - (address % argValue);
                        }
                        return;
                    case 'long':
                        fullOpcode = intToByteArray(argValue);
                        opcodeSize = fullOpcode.length;
                        break;
                    }
                }

                result.push({address : address,
                             opcode : fullOpcode,
                             source : line});
                address += opcodeSize;
            });

            for (var i = 0; i < result.length; ++i) {
                if (result[i].opcode !== null) {
                    for (var j = 0; j < result[i].opcode.length; ++j) {
                        if (result[i].opcode[j] instanceof MissingAddress) {
                            var addr = labels[result[i].opcode[j].label];
                            Array.prototype.splice.apply(result[i].opcode,
                                                         [j, 1].concat(intToByteArray(addr)));
                        }
                    }
                }
            }
        }

        return result;
    };

    my.VM = function(assembledCode, getInput) {
        this.programCounter = 0;

        this.registers = {
            '%eax' : 0,
            '%ebx' : 0,
            '%ecx' : 0,
            '%edx' : 0,
            '%esp' : 0,
            '%ebp' : 0,
            '%esi' : 0,
            '%edi' : 0
        };

        this.flags = {
            zero : false,
            sign : false,
            overflow : false
        };

        this.statusCode = 'AOK';

        this.assembledCode = assembledCode;

        this.memory = new Uint8Array(0x1000);

        this.output = "";

        this.input = "";

        this.inputIndex = 0;

        for (var i = 0; i < assembledCode.length; ++i) {
            if (assembledCode[i].opcode !== null) {
                this.memory.set(assembledCode[i].opcode,
                                assembledCode[i].address);
            }
        }

        function unpackRegisters(packedRegisters) {
            var reg1 = packedRegisters >> 4;
            var reg2 = packedRegisters & 0x0f;

            console.log(reg1)
            console.log(reg2)
            return [reverseRegisterCodes[reg1], reverseRegisterCodes[reg2]]
        }

        function byteArrayToInt(arr) {
            return arr[0] | (arr[1] << 8) | (arr[2] << 16) | (arr[3] << 24);
        }

        this.getIntAt = function(addr) {
            return byteArrayToInt(this.memory.subarray(addr, addr + 4));
        };

        this.advance = function() {
            if (this.statusCode != 'AOK') {
                return;
            }
            switch(reverseOpcodes[this.memory[this.programCounter]]) {
            case 'nop':
                this.programCounter += 1;
                break;
            case 'halt':
                this.statusCode = 'HLT';
                this.programCounter += 1;
                break;
            case 'rrmovl':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);
                this.registers[regs[1]] = this.registers[regs[0]];
                this.programCounter += 2;
                break;
            case 'cmovle':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                if ((this.flags.sign !== this.flags.overflow) || this.flags.zero) {
                    this.registers[regs[1]] = this.registers[regs[0]];
                }

                this.programCounter += 2;
                break;
            case 'cmovl':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                if (this.flags.sign !== this.flags.overflow) {
                    this.registers[regs[1]] = this.registers[regs[0]];
                }

                this.programCounter += 2;
                break;
            case 'cmove':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                if (this.flags.zero) {
                    this.registers[regs[1]] = this.registers[regs[0]];
                }

                this.programCounter += 2;
                break;
            case 'cmovne':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                if (!this.flags.zero) {
                    this.registers[regs[1]] = this.registers[regs[0]];
                }

                this.programCounter += 2;
                break;
            case 'cmovge':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                if (this.flags.sign === this.flags.overflow) {
                    this.registers[regs[1]] = this.registers[regs[0]];
                }

                this.programCounter += 2;
                break;
            case 'cmovg':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                if ((this.flags.sign === this.flags.overflow) && !this.flags.zero) {
                    this.registers[regs[1]] = this.registers[regs[0]];
                }

                this.programCounter += 2;
                break;
            case 'irmovl':
                console.log('irmovl');
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);
                console.log('got regs');

                var val = this.memory.subarray(
                    this.programCounter + 2, this.programCounter + 6);

                console.log('got val');

                val = byteArrayToInt(val);
                console.log(val);

                console.log(regs[1]);
                this.registers[regs[1]] = val;
                console.log('set reg');

                this.programCounter += 6;
                break;
            case 'rmmovl':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                var offset = byteArrayToInt(this.memory.subarray(
                    this.programCounter + 2, this.programCounter + 6));

                var addr = this.registers[regs[1]] + offset;

                this.memory.set(intToByteArray(this.registers[regs[0]]), addr);

                this.programCounter += 6;
                break;
            case 'mrmovl':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                var offset = byteArrayToInt(this.memory.subarray(
                    this.programCounter + 2, this.programCounter + 6));

                var addr = this.registers[regs[1]] + offset;

                this.registers[regs[0]] = byteArrayToInt(this.memory.subarray(addr, addr + 4));

                this.programCounter += 6;
                break;
            case 'addl':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                if (this.registers[regs[1]] + this.registers[regs[0]] > 0x7fffffff ||
                    this.registers[regs[1]] + this.registers[regs[0]] < -0x80000000) {
                    this.flags.overflow = true;
                } else {
                    this.flags.overflow = false;
                }

                this.registers[regs[1]] = (this.registers[regs[1]] + this.registers[regs[0]])|0;

                if (this.registers[regs[1]] === 0) {
                    this.flags.zero = true;
                    this.flags.sign = false;
                } else if (this.registers[regs[1]] < 0) {
                    this.flags.zero = false;
                    this.flags.sign = true;
                } else {
                    this.flags.zero = false;
                    this.flags.sign = false;
                }

                this.programCounter += 2;
                break;
            case 'subl':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                if (this.registers[regs[1]] - this.registers[regs[0]] > 0x7fffffff ||
                    this.registers[regs[1]] - this.registers[regs[0]] < -0x80000000) {
                    this.flags.overflow = true;
                } else {
                    this.flags.overflow = false;
                }

                this.registers[regs[1]] = (this.registers[regs[1]] - this.registers[regs[0]])|0;

                if (this.registers[regs[1]] === 0) {
                    this.flags.zero = true;
                    this.flags.sign = false;
                } else if (this.registers[regs[1]] < 0) {
                    this.flags.zero = false;
                    this.flags.sign = true;
                } else {
                    this.flags.zero = false;
                    this.flags.sign = false;
                }

                this.programCounter += 2;
                break;
            case 'andl':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                this.flags.overflow = false;

                this.registers[regs[1]] = this.registers[regs[1]] & this.registers[regs[0]];

                if (this.registers[regs[1]] === 0) {
                    this.flags.zero = true;
                    this.flags.sign = false;
                } else if (this.registers[regs[1]] < 0) {
                    this.flags.zero = false;
                    this.flags.sign = true;
                } else {
                    this.flags.zero = false;
                    this.flags.sign = false;
                }

                this.programCounter += 2;
                break;
            case 'xorl':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                this.flags.overflow = false;

                this.registers[regs[1]] = this.registers[regs[1]] ^ this.registers[regs[0]];

                if (this.registers[regs[1]] === 0) {
                    this.flags.zero = true;
                    this.flags.sign = false;
                } else if (this.registers[regs[1]] < 0) {
                    this.flags.zero = false;
                    this.flags.sign = true;
                } else {
                    this.flags.zero = false;
                    this.flags.sign = false;
                }

                this.programCounter += 2;
                break;
            case 'multl':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                if (this.registers[regs[1]] * this.registers[regs[0]] > 0x7fffffff ||
                    this.registers[regs[1]] * this.registers[regs[0]] < -0x80000000) {
                    this.flags.overflow = true;
                } else {
                    this.flags.overflow = false;
                }

                this.registers[regs[1]] = (this.registers[regs[1]] * this.registers[regs[0]])|0;

                if (this.registers[regs[1]] === 0) {
                    this.flags.zero = true;
                    this.flags.sign = false;
                } else if (this.registers[regs[1]] < 0) {
                    this.flags.zero = false;
                    this.flags.sign = true;
                } else {
                    this.flags.zero = false;
                    this.flags.sign = false;
                }

                this.programCounter += 2;
                break;
            case 'divl':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                if (this.registers[regs[0]] === 0) {
                    this.statusCode = 'INS';
                    break;
                }

                if (this.registers[regs[1]] / this.registers[regs[0]] > 0x7fffffff ||
                    this.registers[regs[1]] / this.registers[regs[0]] < -0x80000000) {
                    this.flags.overflow = true;
                } else {
                    this.flags.overflow = false;
                }

                this.registers[regs[1]] = (this.registers[regs[1]] / this.registers[regs[0]])|0;

                if (this.registers[regs[1]] === 0) {
                    this.flags.zero = true;
                    this.flags.sign = false;
                } else if (this.registers[regs[1]] < 0) {
                    this.flags.zero = false;
                    this.flags.sign = true;
                } else {
                    this.flags.zero = false;
                    this.flags.sign = false;
                }

                this.programCounter += 2;
                break;
            case 'modl':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                if (this.registers[regs[0]] === 0) {
                    this.statusCode = 'INS';
                    break;
                }

                if (this.registers[regs[1]] % this.registers[regs[0]] > 0x7fffffff ||
                    this.registers[regs[1]] % this.registers[regs[0]] < -0x80000000) {
                    this.flags.overflow = true;
                } else {
                    this.flags.overflow = false;
                }

                this.registers[regs[1]] = (this.registers[regs[1]] % this.registers[regs[0]])|0;

                if (this.registers[regs[1]] === 0) {
                    this.flags.zero = true;
                    this.flags.sign = false;
                } else if (this.registers[regs[1]] < 0) {
                    this.flags.zero = false;
                    this.flags.sign = true;
                } else {
                    this.flags.zero = false;
                    this.flags.sign = false;
                }

                this.programCounter += 2;
                break;
            case 'jmp':
                var addr = byteArrayToInt(this.memory.subarray(this.programCounter + 1, this.programCounter + 5));
                this.programCounter = addr;
                break;
            case 'jle':
                var addr = byteArrayToInt(this.memory.subarray(this.programCounter + 1, this.programCounter + 5));

                if ((this.flags.sign !== this.flags.overflow) || this.flags.zero) {
                    this.programCounter = addr;
                } else {
                    this.programCounter += 5;
                }

                break;
            case 'jl':
                var addr = byteArrayToInt(this.memory.subarray(this.programCounter + 1, this.programCounter + 5));

                if (this.flags.sign !== this.flags.overflow) {
                    this.programCounter = addr;
                } else {
                    this.programCounter += 5;
                }

                break;
            case 'je':
                var addr = byteArrayToInt(this.memory.subarray(this.programCounter + 1, this.programCounter + 5));

                if (this.flags.zero) {
                    this.programCounter = addr;
                } else {
                    this.programCounter += 5;
                }

                break;
            case 'jne':
                var addr = byteArrayToInt(this.memory.subarray(this.programCounter + 1, this.programCounter + 5));

                if (!this.flags.zero) {
                    this.programCounter = addr;
                } else {
                    this.programCounter += 5;
                }

                break;
            case 'jge':
                var addr = byteArrayToInt(this.memory.subarray(this.programCounter + 1, this.programCounter + 5));

                if (this.flags.sign === this.flags.overflow) {
                    this.programCounter = addr;
                } else {
                    this.programCounter += 5;
                }

                break;
            case 'jg':
                var addr = byteArrayToInt(this.memory.subarray(this.programCounter + 1, this.programCounter + 5));

                if ((this.flags.sign === this.flags.overflow) && !this.flags.zero) {
                    this.programCounter = addr;
                } else {
                    this.programCounter += 5;
                }

                break;
            case 'call':
                var addr = byteArrayToInt(this.memory.subarray(this.programCounter + 1, this.programCounter + 5));

                this.registers['%esp'] -= 4;
                this.memory.set(intToByteArray(this.programCounter + 5), this.registers['%esp']);
                this.programCounter = addr;

                break;
            case 'ret':
                var addr = byteArrayToInt(this.memory.subarray(this.registers['%esp'], this.registers['%esp'] + 4));

                this.registers['%esp'] += 4;
                this.programCounter = addr;

                break;
            case 'pushl':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                this.registers['%esp'] -= 4;
                this.memory.set(intToByteArray(this.registers[regs[0]]), this.registers['%esp']);

                this.programCounter += 2;

                break;
            case 'popl':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                this.registers[regs[0]] = byteArrayToInt(this.memory.subarray(this.registers['%esp'], this.registers['%esp'] + 4));
                this.registers['%esp'] += 4;
                this.programCounter += 2;

                break;
            case 'rdch':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);
                var ch = '';

                while ((ch = this.input.charAt(this.inputIndex)) === '') {
                    this.input += getInput();
                }

                ++this.inputIndex;
                this.registers[regs[0]] = ch.charCodeAt(0);
                break;
            case 'wrch':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                this.ouptut += String.fromCharCode(this.registers[regs[0]]);
                this.programCounter += 2;

                break;
            case 'rdint':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);
                var intString = '';

                var parsingInt = true;
                do {
                    var ch = this.input.charAt(this.inputIndex);

                    if (ch === '' && intString === '') {
                        this.input += getInput();
                    } else if (ch.match(/\s/)) {
                        ++this.inputIndex;
                    } else if (ch.match(/\d/) ||
                               (intString === '' && ch === '-')) {
                        intString += ch;
                        ++this.inputIndex;
                    } else if (intString === '') {
                        this.statusCode = 'INS';
                        parsingInt = false;
                    } else {
                        this.registers[regs[0]] = parseInt(intString);
                        this.programCounter += 2;
                        parsingInt = false;
                    }
                } while (parsingInt);

                break;
            case 'wrint':
                var regs = unpackRegisters(this.memory[this.programCounter + 1]);

                this.output += '' + this.registers[regs[0]];
                this.programCounter += 2;

                break;
            default:
                this.statusCode = 'INS';
                break;
            }
        };
    }

    return my;
})();
