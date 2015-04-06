Yas = (function() {
    // We'll return this object to provide an interface to the assembler/vm
    var my = {};

    // The byte representation of each y86 instruction
    var opcodes = {
        // No-op and halt
        'nop' : 0x00, 'halt' : 0x10,

        // Moves
        'rrmovl' : 0x20, 'cmovle' : 0x21, 'cmovl' : 0x22, 'cmove' : 0x23,
        'cmovne' : 0x24, 'cmovge' : 0x25, 'cmovg' : 0x26, 'irmovl' : 0x30,
        'rmmovl' : 0x40, 'mrmovl' : 0x50,

        // Arithmetic and bitwise ops
        'addl' : 0x60, 'subl' : 0x61, 'andl' : 0x62, 'xorl' : 0x63,
        'multl' : 0x64, 'divl' : 0x65, 'modl' : 0x66,

        // Jumps
        'jmp' : 0x70, 'jle' : 0x71, 'jl' : 0x72, 'je' : 0x73, 'jne' : 0x74,
        'jge' : 0x75, 'jg' : 0x76,

        // Function calls
        'call' : 0x80, 'ret' : 0x90,

        // Stack manipulation
        'pushl' : 0xa0, 'popl' : 0xb0,

        // I/O
        'rdch' : 0xf0, 'wrch' : 0xf1, 'rdint' : 0xf2, 'wrint' : 0xf3
    };

    // We construct a reverse mapping of the opcodes so we can get the
    // instruction they represent
    var reverseOpcodes = {};
    for (instruction in opcodes) {
        reverseOpcodes[opcodes[instruction]] = instruction;
    }

    // The nibble representation of each of the y86 registers
    var registerCodes = {
        '%eax' : 0x0, '%ecx' : 0x1, '%edx' : 0x2, '%ebx' : 0x3,
        '%esp' : 0x4, '%ebp' : 0x5, '%esi' : 0x6, '%edi' : 0x7,

        // This isn't a real register, but rather how instructions indicate that
        // no register should be used
        'none' : 0x8
    };

    // We construct a reverse mapping of the register codes so we can get the
    // register they represent
    var reverseRegisterCodes = {};
    for (register in registerCodes) {
        reverseRegisterCodes[registerCodes[register]] = register;
    }

    // This section specifies regular expressions that we compose to parse valid
    // programs

    // Instructions that take no arguments
    var noArgInstructions = ['halt', 'nop', 'ret'];

    // Instructions that take a single register argument
    var regInstructions = ['pushl', 'popl', 'rdch', 'wrch', 'rdint', 'wrint'];

    // Instructions that take a single label argument
    var labelInstructions = ['jmp', 'jle', 'jl', 'je',
                             'jne', 'jge', 'jg', 'call'];

    // Instructions that take two register arguments
    var regRegInstructions = ['rrmovl', 'cmovle', 'cmovl', 'cmove', 'cmovne',
                              'cmovge', 'cmovg', 'addl', 'subl', 'andl',
                              'xorl', 'multl', 'divl', 'modl'];

    // Assembler directives (each takes a single numerical argument)
    var directives = ['pos', 'align', 'long'];

    // Here we re-iterate valid registers, excluding the 'none' from our map
    var registers = ['%eax', '%ebx', '%ecx', '%edx',
                     '%esp', '%ebp', '%esi', '%edi'];

    // Matches any register
    var registerPattern = '(?:' + registers.join('|') + ')';

    // Matches valid labels. I'm assuming that labels can only have letters and
    // underscores, UMD's assembler may be more permissive
    var labelPattern = '(?:[a-zA-Z_]+)';

    // Matches a number (possibly negative) in decimal format
    var decimalPattern = '(?:-?[0-9]+)';

    // Matches a number (possibly negative) in hexadecimal format, which must be
    // preceeded by 0x
    var hexPattern = '(?:-?0x[0-9a-fA-F]+)';

    // Matches a number in either decimal or hexadecimal format
    var numericPattern = '(?:' + decimalPattern + '|' + hexPattern + ')';

    // Matches addresses of the format offset(register). Note that this pattern
    // captures the offset and register.
    var addressPattern =
        '(?:(' + numericPattern + ')?\\((' + registerPattern + ')\\))';

    // Matches any non-zero amount of whitespace
    var spacePattern = '(?:\\s+)';

    // Matches a comma surrounded by any amount of whitespace
    var commaPattern = '(?:\\s*,\\s*)';

    // Matches a comment. Note that this does not match to the end of the line,
    // so placing it before another pattern will give incorrect results
    var commentPattern = '(?:#.*)';

    // Matches and captures an instruction that takes no arguments
    var noArgInstructionPattern = '(' + noArgInstructions.join('|') + ')';

    // Matches and captures an instruction that takes a single register
    // argument, and captures its argument
    var regInstructionPattern =
        '(?:(' + regInstructions.join('|') + ')' +
        spacePattern +
        '(' + registerPattern + '))';

    // Matches and captures an instruction that takes a single label argument,
    // and captures its argument
    var labelInstructionPattern =
        '(?:(' + labelInstructions.join('|') + ')' +
        spacePattern +
        '(' + labelPattern + '))';

    // Matches and captures an instruction that takes a two register arguments,
    // and captures its arguments
    var regRegInstructionPattern =
        '(?:(' + regRegInstructions.join('|') + ')' +
        spacePattern +
        '(' + registerPattern + ')' +
        commaPattern +
        '(' + registerPattern + '))';

    // Matches an irmovl instruction, and captures its numerical or label
    // argument, and its register argument
    var irmovlPattern =
        '(?:irmovl' +
        spacePattern +
        '(?:(?:\\$?(' + numericPattern + '))|(' + labelPattern + '))' +
        commaPattern +
        '(' + registerPattern + '))';

    // Matches an rmmovl instruction, and captures its register argument and its
    // address argument
    var rmmovlPattern =
        '(?:rmmovl' +
        spacePattern +
        '(' + registerPattern + ')' +
        commaPattern +
        addressPattern + ')';

    // Matches an mrmovl instruction, and captures its address argument and its
    // register argument
    var mrmovlPattern =
        '(?:mrmovl' +
        spacePattern +
        addressPattern +
        commaPattern +
        '(' + registerPattern + '))';

    // Matches and captures an assembler directive and its numerical argument
    var directivePattern =
        '(?:\\.(' + directives.join('|') + ')' +
        spacePattern +
        '(' + numericPattern + '))';

    // Matches any instruction
    var instructionPattern =
        '(?:' +
        noArgInstructionPattern + '|' +
        regInstructionPattern + '|' +
        labelInstructionPattern + '|' +
        regRegInstructionPattern + '|' +
        irmovlPattern + '|' +
        rmmovlPattern + '|' +
        mrmovlPattern + ')';

    // Matches a line, and captures its label and its instruction or directive
    var linePattern =
        '^\\s*' +
        '(?:(' + labelPattern + '):)?' +
        '\\s*' +
        '(' + instructionPattern + '|' + directivePattern + ')?' +
        '\\s*' +
        '(?:' + commentPattern + ')?$';

    // Takes two register names and produces a byte in which the high nibble
    // represents the first register and the low nibble represents the second
    // register
    function packRegisters(r1, r2) {
        return (registerCodes[r1] << 4) | registerCodes[r2];
    }

    // Takes a 32-bit integer and produces an array of bytes which when
    // concatenated represents that integer in little-endian format
    function intToByteArray(val) {
        return [(val & 0x000000ff) >>> 0,
                (val & 0x0000ff00) >>> 8,
                (val & 0x00ff0000) >>> 16,
                (val & 0xff000000) >>> 24];
    }

    // Define and export a class which represents an exception caused by a
    // failure to parse a program
    my.ParseException = function (message) {
        this.message = message;
    }

    // Define a class which represents a label that should be replaced by an
    // actual address at a later point during assembly
    function MissingAddress(label) {
        this.label = label;
    }

    // Take a string of y86 source code and return an array of objects. Each
    // object corresponds to a line of the input, and contains the address,
    // binary representation, and source for the resulting assembled code
    my.assemble = function(source) {
        var result = []; // The resulting array
        var address = 0; // The address of the current instruction
        var labels = {}; // A mapping of labels to addresses

        // Split the source code into lines
        var lines = source.match(/[^\r\n]+/g);

        // Make sure we don't break if the input is empty
        if (lines !== null) {
            // We make a pass through the source before fully parsing so that we
            // can determine all of the labels that are defined in the program
            lines.forEach(function(line) {
                // Match the line against our line pattern so that we can
                // extract its label, if it has one
                var lineMatches = line.match(new RegExp(linePattern));

                // If the line didn't match, the input is invalid, so we have to
                // stop parsing
                if (lineMatches === null) {
                    throw new my.ParseException('Invalid line');
                }

                // Try to extract a label from the line
                var label = lineMatches[1];
                if (label !== undefined) {
                    // Make sure that the label has not already been used
                    if (labels[label] !== undefined) {
                        throw new my.ParseException("Redefining label '" +
                                                    label + "'");
                    }

                    // Add the label to our map. We don't know what its address
                    // will be yet, so just set it to MissingAddress
                    labels[label] = new MissingAddress(label);
                }
            });

            // Now we can properly parse the program
            lines.forEach(function(line) {
                // Again try to extract a label from the line. This time, we
                // know that its address will be the current address, so we can
                // update its value
                var lineMatches = line.match(new RegExp(linePattern));
                var label = lineMatches[1];
                if (label !== undefined) {
                    labels[label] = address;
                }

                // Now we can try to extract an instruction. If there is no
                // instruction, we can just skip this line
                var instruction = lineMatches[2];
                if (instruction === undefined) {
                    result.push({address : address,
                                 opcode : null,
                                 source : line});
                    return;
                }

                // We now know that we have an instruction (or directive, at
                // least).
                var instructionMatches = null; // The result of matching against
                                               // an instruction
                var fullOpcode = null; // The byte representation of an opcode,
                                       // as an array of bytes
                var addressOffset = 0; // The address of the next instruction

                if (instructionMatches = instruction.
                    match(new RegExp(noArgInstructionPattern))) {
                    var opcode = opcodes[instructionMatches[1]];
                    fullOpcode = [opcode];
                    addressOffset = fullOpcode.length;
                } else if (instructionMatches = instruction.
                           match(new RegExp(regInstructionPattern))) {
                    var opcode = opcodes[instructionMatches[1]];
                    var regParam = instructionMatches[2];
                    fullOpcode = [opcode, packRegisters(regParam, 'none')];
                    addressOffset = fullOpcode.length;
                } else if (instructionMatches = instruction.
                           match(new RegExp(labelInstructionPattern))) {
                    var opcode = opcodes[instructionMatches[1]];
                    var labelParam = instructionMatches[2];

                    // Make sure that they aren't trying to use a label which
                    // doesn't exist
                    if (labels[labelParam] === undefined) {
                        throw new my.ParseException('Label undefined');
                    }

                    var addr = labels[labelParam];
                    var opcodeStart = [opcode];

                    // We might not know the address of the label yet. In this
                    // case, just record it, and set the address offset to
                    // include the full size of an address
                    if (addr instanceof MissingAddress) {
                        fullOpcode = opcodeStart.concat([addr]);
                        addressOffset = opcodeStart.length + 4;
                    } else {
                        fullOpcode = opcodeStart.concat(intToByteArray(addr));
                        addressOffset = fullOpcode.length;
                    }
                } else if (instructionMatches = instruction.
                           match(new RegExp(regRegInstructionPattern))) {
                    var opcode = opcodes[instructionMatches[1]];
                    var regParam1 = instructionMatches[2];
                    var regParam2 = instructionMatches[3];

                    fullOpcode = [opcode, packRegisters(regParam1, regParam2)];
                    addressOffset = fullOpcode.length;
                } else if (instructionMatches = instruction.
                           match(new RegExp(irmovlPattern))) {
                    var opcode = opcodes['irmovl'];
                    var regParam = instructionMatches[3];
                    var value;

                    // irmovl can take a number or a label, so we need to detect
                    // which was provided
                    if (instructionMatches[1] !== undefined) {
                        var numberParam = instructionMatches[1];

                        // If its a number, we need to see if it is decimal or
                        // hexadecimal
                        if (numberParam.match(new RegExp(hexPattern))) {
                            value = parseInt(numberParam, 16);
                        } else {
                            value = parseInt(numberParam, 10);
                        }
                    } else {
                        var labelParam = instructionMatches[2];

                        // Again, the label may not exist, so we need to deal
                        // with that
                        if (labels[labelParam] == undefined) {
                            throw new my.ParseException('Label undefined');
                        }

                        value = labels[labelParam];
                    }

                    // The address of the label may not be known yet, so if it
                    // isn't, just record it and increment the address as if it
                    // was there
                    var opcodeStart = [opcode, packRegisters('none', regParam)];
                    if (value instanceof MissingAddress) {
                        fullOpcode = opcodeStart.concat([value]);
                        addressOffset = opcodeStart.length + 4;
                    } else {
                        fullOpcode = opcodeStart.concat(intToByteArray(value));
                        addressOffset = fullOpcode.length;
                    }
                } else if (instructionMatches = instruction.
                           match(new RegExp(rmmovlPattern))) {
                    var opcode = opcodes['rmmovl'];
                    var regParam1 = instructionMatches[1];
                    var regParam2 = instructionMatches[3];
                    var offset = instructionMatches[2];
                    var offsetVal;

                    // An offset doesn't have to be provided for the address. If
                    // it isn't, the offset is assumed to be 0.
                    if (offset === undefined) {
                        offsetVal = 0;
                    } else if (offset.match(new RegExp(hexPattern))) {
                        offsetVal = parseInt(offset, 16);
                    } else {
                        offsetVal = parseInt(offset, 10);
                    }

                    var opcodeStart = [opcode,
                                       packRegisters(regParam1, regParam2)];
                    fullOpcode = opcodeStart.concat(intToByteArray(offsetVal));
                    addressOffset = fullOpcode.length;
                } else if (instructionMatches = instruction.
                           match(new RegExp(mrmovlPattern))) {
                    var opcode = opcodes['mrmovl'];
                    var regParam1 = instructionMatches[2];
                    var regParam2 = instructionMatches[3];
                    var offset = instructionMatches[1];
                    var offsetVal;

                    // An offset doesn't have to be provided for the address. If
                    // it isn't, the offset is assumed to be 0.
                    if (offset === undefined) {
                        offsetVal = 0;
                    } else if (offset.match(new RegExp(hexPattern))) {
                        offsetVal = parseInt(offset, 16);
                    } else {
                        offsetVal = parseInt(offset, 10);
                    }

                    // Yes, mrmovl expects its registers in reverse order
                    var opcodeStart = [opcode,
                                       packRegisters(regParam2, regParam1)];
                    fullOpcode = opcodeStart.concat(intToByteArray(offsetVal));
                    addressOffset = fullOpcode.length;
                } else if (instructionMatches = instruction.
                           match(new RegExp(directivePattern))) {
                    var directive = instructionMatches[1];
                    var arg = instructionMatches[2];
                    var argValue;

                    // Arguments to directives can be either decimal or hex
                    if (arg.match(new RegExp(hexPattern))) {
                        argValue = parseInt(arg, 16);
                    } else {
                        argValue = parseInt(arg, 10);
                    }

                    switch (directive) {
                    case 'pos':
                        // pos doesn't add an offset to the address, so it makes
                        // more sense for it to just return early
                        result.push({address: address,
                                     opcode: null,
                                     source: line});

                        address = argValue;
                        return;
                    case 'align':
                        if (address % argValue !== 0) {
                            addressOffset = argValue - (address % argValue);
                        } else {
                            addressOffset = 0;
                        }
                        break;
                    case 'long':
                        fullOpcode = intToByteArray(argValue);
                        addressOffset = fullOpcode.length;
                        break;
                    }
                }

                result.push({address : address,
                             opcode : fullOpcode,
                             source : line});
                address += addressOffset;
            });

            // Now that we know the address of each label, we need to go through
            // the result and replace all the MissingAddress objects with actual
            // addresses
            result.forEach(function (line) {
                if (line.opcode !== null) {
                    for (var i = 0; i < line.opcode.length; ++i) {
                        if (line.opcode[i] instanceof MissingAddress) {
                            var addr =
                                intToByteArray(labels[line.opcode[i].label]);
                            Array.prototype.splice.apply(line.opcode,
                                                         [i, 1].concat(addr));
                        }
                    }
                }
            });
        }

        return result;
    };

    // Create and export a class that represents a virtual machine. This class
    // takes two parameters: an object representing assembled code (from
    // Yas.assemble), and a function that returns a string, which is called when
    // the program needs input
    my.VM = function(assembledCode, getInput) {
        // The address of the next instruction to execute
        this.programCounter = 0;

        // An object representing the value of each of the registers
        this.registers = {
            '%eax' : 0, '%ebx' : 0, '%ecx' : 0, '%edx' : 0,
            '%esp' : 0, '%ebp' : 0, '%esi' : 0, '%edi' : 0
        };

        // An object with the three flags that the y86 VM sets
        this.flags = {
            zero : false,
            sign : false,
            overflow : false
        };

        // The current "exception" of the virtual machine, which has four
        // possible values: AOK, HLT, INS, and ADR
        this.statusCode = 'AOK';

        // The code that we are given
        this.assembledCode = assembledCode;

        // An array of bytes which represents the memory of the virtual machine
        this.memory = new Uint8Array(0x1000);

        // All of the output which the virtual machine has produced
        this.output = "";

        // Input that the virtual machine has. When all of the input is
        // consumed, we call getInput to get more
        this.input = "";

        // The index of the next character that will be read from the input. If
        // this is equal to this.input.length, getInput is called to get more
        this.inputIndex = 0;

        // We initialize the virtual machine by moving all of the instructions
        // from the assembled code into its memory
        for (var i = 0; i < assembledCode.length; ++i) {
            if (assembledCode[i].opcode !== null) {
                this.memory.set(assembledCode[i].opcode,
                                assembledCode[i].address);
            }
        }

        // Takes a byte that represents two registers, and returns an array with
        // the string representation of each register
        function unpackRegisters(packedRegisters) {
            var reg1 = packedRegisters >>> 4;
            var reg2 = packedRegisters & 0x0f;

            return [reverseRegisterCodes[reg1], reverseRegisterCodes[reg2]]
        }

        // Convert an array of bytes to a 32-bit integer, assuming the array is
        // stored little-endian.
        function byteArrayToInt(arr) {
            return arr[0] | (arr[1] << 8) | (arr[2] << 16) | (arr[3] << 24);
        }

        // Export a function to get an integer from a memory address
        this.getIntAt = function(addr) {
            return byteArrayToInt(this.memory.subarray(addr, addr + 4));
        };

        // Advance the virtual machine by performing one instruction
        this.advance = function() {
            // If there has been an exception, advancing does nothing
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
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);
                this.registers[regs[1]] = this.registers[regs[0]];
                this.programCounter += 2;
                break;
            case 'cmovle':
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                // !== is the same as logical xor
                if ((this.flags.sign !== this.flags.overflow) ||
                    this.flags.zero) {
                    this.registers[regs[1]] = this.registers[regs[0]];
                }

                this.programCounter += 2;
                break;
            case 'cmovl':
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                // !== is the same as logical xor
                if (this.flags.sign !== this.flags.overflow) {
                    this.registers[regs[1]] = this.registers[regs[0]];
                }

                this.programCounter += 2;
                break;
            case 'cmove':
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                if (this.flags.zero) {
                    this.registers[regs[1]] = this.registers[regs[0]];
                }

                this.programCounter += 2;
                break;
            case 'cmovne':
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                if (!this.flags.zero) {
                    this.registers[regs[1]] = this.registers[regs[0]];
                }

                this.programCounter += 2;
                break;
            case 'cmovge':
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                if (this.flags.sign === this.flags.overflow) {
                    this.registers[regs[1]] = this.registers[regs[0]];
                }

                this.programCounter += 2;
                break;
            case 'cmovg':
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                if ((this.flags.sign === this.flags.overflow) &&
                    !this.flags.zero) {
                    this.registers[regs[1]] = this.registers[regs[0]];
                }

                this.programCounter += 2;
                break;
            case 'irmovl':
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                var val = this.memory.subarray(
                    this.programCounter + 2, this.programCounter + 6);

                val = byteArrayToInt(val);
                this.registers[regs[1]] = val;

                this.programCounter += 6;
                break;
            case 'rmmovl':
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                var offset = byteArrayToInt(this.memory.subarray(
                    this.programCounter + 2, this.programCounter + 6));

                var addr = this.registers[regs[1]] + offset;

                this.memory.set(intToByteArray(this.registers[regs[0]]), addr);

                this.programCounter += 6;
                break;
            case 'mrmovl':
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                var offset = byteArrayToInt(
                    this.memory.subarray(this.programCounter + 2,
                                         this.programCounter + 6));

                var addr = this.registers[regs[1]] + offset;

                this.registers[regs[0]] =
                    byteArrayToInt(this.memory.subarray(addr, addr + 4));

                this.programCounter += 6;
                break;
            case 'addl':
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                // Javascript numbers go above the range of 32-bit integers, so
                // detecting overflow is actually quite straightforward
                if (this.registers[regs[1]] +
                    this.registers[regs[0]] > 0x7fffffff ||
                    this.registers[regs[1]] +
                    this.registers[regs[0]] < -0x80000000) {
                    this.flags.overflow = true;
                } else {
                    this.flags.overflow = false;
                }

                // We bitwise-or with 0 to force Javascript to convert the
                // result into a 32-bit integer, with overflow
                this.registers[regs[1]] = (this.registers[regs[1]] +
                                           this.registers[regs[0]])|0;

                // Set all of our flags
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
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                if (this.registers[regs[1]] -
                    this.registers[regs[0]] > 0x7fffffff ||
                    this.registers[regs[1]] -
                    this.registers[regs[0]] < -0x80000000) {
                    this.flags.overflow = true;
                } else {
                    this.flags.overflow = false;
                }

                this.registers[regs[1]] = (this.registers[regs[1]] -
                                           this.registers[regs[0]])|0;

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
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                // Bitwise and can't overflow
                this.flags.overflow = false;

                this.registers[regs[1]] =
                    this.registers[regs[1]] & this.registers[regs[0]];

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
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                // Bitwise xor can't overflow
                this.flags.overflow = false;

                this.registers[regs[1]] =
                    this.registers[regs[1]] ^ this.registers[regs[0]];

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
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                if (this.registers[regs[1]] *
                    this.registers[regs[0]] > 0x7fffffff ||
                    this.registers[regs[1]] *
                    this.registers[regs[0]] < -0x80000000) {
                    this.flags.overflow = true;
                } else {
                    this.flags.overflow = false;
                }

                this.registers[regs[1]] =
                    (this.registers[regs[1]] * this.registers[regs[0]])|0;

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
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                if (this.registers[regs[0]] === 0) {
                    this.statusCode = 'INS';
                    break;
                }

                if (this.registers[regs[1]] /
                    this.registers[regs[0]] > 0x7fffffff ||
                    this.registers[regs[1]] /
                    this.registers[regs[0]] < -0x80000000) {
                    this.flags.overflow = true;
                } else {
                    this.flags.overflow = false;
                }

                this.registers[regs[1]] = (this.registers[regs[1]] /
                                           this.registers[regs[0]])|0;

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
            case 'modl': // I have no idea how y86 mod works for negative values
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                if (this.registers[regs[0]] === 0) {
                    this.statusCode = 'INS';
                    break;
                }

                if (this.registers[regs[1]] %
                    this.registers[regs[0]] > 0x7fffffff ||
                    this.registers[regs[1]] %
                    this.registers[regs[0]] < -0x80000000) {
                    this.flags.overflow = true;
                } else {
                    this.flags.overflow = false;
                }

                this.registers[regs[1]] = (this.registers[regs[1]] %
                                           this.registers[regs[0]])|0;

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
                var addr = byteArrayToInt(
                    this.memory.subarray(this.programCounter + 1,
                                         this.programCounter + 5));
                this.programCounter = addr;
                break;
            case 'jle':
                var addr = byteArrayToInt(
                    this.memory.subarray(this.programCounter + 1,
                                         this.programCounter + 5));

                if ((this.flags.sign !== this.flags.overflow) ||
                    this.flags.zero) {
                    this.programCounter = addr;
                } else {
                    this.programCounter += 5;
                }

                break;
            case 'jl':
                var addr = byteArrayToInt(
                    this.memory.subarray(this.programCounter + 1,
                                         this.programCounter + 5));

                if (this.flags.sign !== this.flags.overflow) {
                    this.programCounter = addr;
                } else {
                    this.programCounter += 5;
                }

                break;
            case 'je':
                var addr = byteArrayToInt(
                    this.memory.subarray(this.programCounter + 1,
                                         this.programCounter + 5));

                if (this.flags.zero) {
                    this.programCounter = addr;
                } else {
                    this.programCounter += 5;
                }

                break;
            case 'jne':
                var addr = byteArrayToInt(
                    this.memory.subarray(this.programCounter + 1,
                                         this.programCounter + 5));

                if (!this.flags.zero) {
                    this.programCounter = addr;
                } else {
                    this.programCounter += 5;
                }

                break;
            case 'jge':
                var addr = byteArrayToInt(
                    this.memory.subarray(this.programCounter + 1,
                                         this.programCounter + 5));

                if (this.flags.sign === this.flags.overflow) {
                    this.programCounter = addr;
                } else {
                    this.programCounter += 5;
                }

                break;
            case 'jg':
                var addr = byteArrayToInt(
                    this.memory.subarray(this.programCounter + 1,
                                         this.programCounter + 5));

                if ((this.flags.sign === this.flags.overflow) &&
                    !this.flags.zero) {
                    this.programCounter = addr;
                } else {
                    this.programCounter += 5;
                }

                break;
            case 'call':
                var addr = byteArrayToInt(
                    this.memory.subarray(this.programCounter + 1,
                                         this.programCounter + 5));

                this.registers['%esp'] -= 4;
                this.memory.set(intToByteArray(this.programCounter + 5),
                                this.registers['%esp']);
                this.programCounter = addr;

                break;
            case 'ret':
                var addr = byteArrayToInt(
                    this.memory.subarray(this.registers['%esp'],
                                         this.registers['%esp'] + 4));

                this.registers['%esp'] += 4;
                this.programCounter = addr;

                break;
            case 'pushl':
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                this.registers['%esp'] -= 4;
                this.memory.set(intToByteArray(this.registers[regs[0]]),
                                this.registers['%esp']);

                this.programCounter += 2;

                break;
            case 'popl':
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                this.registers[regs[0]] = byteArrayToInt(
                    this.memory.subarray(this.registers['%esp'],
                                         this.registers['%esp'] + 4));
                this.registers['%esp'] += 4;
                this.programCounter += 2;

                break;
            case 'rdch':
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);
                var ch = '';

                // Call getInput until we get some input
                while ((ch = this.input.charAt(this.inputIndex)) === '') {
                    this.input += getInput();
                }

                ++this.inputIndex;
                this.registers[regs[0]] = ch.charCodeAt(0);
                break;
            case 'wrch':
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                this.output += String.fromCharCode(this.registers[regs[0]]);
                this.programCounter += 2;

                break;
            case 'rdint':
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);
                var intString = '';

                // Read input, skipping spaces, until we reach an integer. Read
                // until we reach a non-number, and then store the result in a
                // register. If we read something other than a number, we set
                // the "exception" to INS.
                var parsingInt = true;
                do {
                    var ch = this.input.charAt(this.inputIndex);

                    if (ch === '' && intString === '') {
                        // We're out of input and read nothing
                        this.input += getInput();
                    } else if (ch.match(/\s/)) {
                        // Whitespace
                        ++this.inputIndex;
                    } else if (ch.match(/\d/) ||
                               (intString === '' && ch === '-')) {
                        // Digit or leading minus sign
                        intString += ch;
                        ++this.inputIndex;
                    } else if (intString === '' || intString === '-') {
                        // We didn't read an integer
                        this.statusCode = 'INS';
                        parsingInt = false;
                    } else {
                        // We read an integer
                        this.registers[regs[0]] = parseInt(intString);
                        this.programCounter += 2;
                        parsingInt = false;
                    }
                } while (parsingInt);

                break;
            case 'wrint':
                var regs =
                    unpackRegisters(this.memory[this.programCounter + 1]);

                this.output += '' + this.registers[regs[0]];
                this.programCounter += 2;

                break;
            default: // We read an invalid instruction
                this.statusCode = 'INS';
                break;
            }
        };
    }

    return my;
})();
